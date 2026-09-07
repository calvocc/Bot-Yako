import type { Boton, RespuestaBot } from '../channels/channel.types';
import {
  botonesPaginados,
  ID_VER_MAS,
  paginaSiguiente,
} from '../conversacion/pasos-comunes/paginacion';
import { CLAVE_EQUIPO_ID } from '../conversacion/pasos-comunes/selector-equipo';
import type { ContextoFlujo, DatosFlujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import {
  describirJugador,
  type Jugador,
  type JugadoresService,
  parsearJugador,
} from '../jugadores/jugadores.service';
import { type EventosService, type ResultadoRegistro } from './eventos.service';

/**
 * Pasos de la carga post partido (RF-4.1: marcador, goleadores y tarjetas,
 * sin minuto ni tiempos).
 *
 * Viven en su propio archivo por tamaño: `cargar.flujo.ts` ya es grande, y
 * estos pasos se plantan tal cual dentro de su mismo `FLUJO_CARGAR` (una
 * sesión de post partido pasa por `pasoModo` igual que la de en vivo). Los
 * ganchos que reciben son la parte de `CargarFlujo` que sí hay que compartir
 * —las guardas de permiso/partido perdido—; el resto (equipo, partido) ya
 * viaja en `ctx.datos` gracias a las claves compartidas de
 * `selector-equipo.ts` y `cargar.flujo.ts`.
 *
 * Goleadores y tarjetas se eligen tocando la plantilla, no escribiendo el
 * nombre: cada toque registra un evento y vuelve a la misma pregunta (de
 * nuevo, si anotó o vio tarjeta más de una vez), hasta tocar "Listo". Quien
 * no está en la plantilla entra por "Otro jugador", que sigue aceptando el
 * nombre escrito — no hay plantilla de la que elegir a alguien que no está
 * cargado. Las dos variantes (goleadores/tarjetas) comparten exactamente el
 * mismo mecanismo de selección —`pasoElegirDeLaPlantilla`/`pasoJugadorLibre`
 * más abajo—, parametrizado solo en lo que de verdad difiere: qué pasa al
 * elegir a alguien (un gol se registra de una; una tarjeta primero pregunta
 * el color).
 *
 * Cada pregunta manda un mensaje nuevo — nunca se edita la anterior, a
 * diferencia del panel en vivo (que sí se edita en el sitio porque ahí todo
 * pasa en un único mensaje que se va actualizando). Acá, sin nada que avise
 * que el mensaje cambió, un papá podía tocar "Corregir todo" y no darse
 * cuenta de que la pregunta de goleadores ya estaba lista más arriba en el
 * chat -- quedaba mirando el resumen de siempre, sin ver que había algo
 * nuevo que contestar.
 */
export interface GanchosPostPartido {
  datosPanel(ctx: ContextoFlujo): DatosFlujo;
  partidoId(ctx: ContextoFlujo): string;
  siguePudiendoCargar(ctx: ContextoFlujo): Promise<boolean>;
  sinPermiso(): Transicion;
  partidoPerdido(): Transicion;
}

const PREFIJO_JUGADOR = 'pj:';
const ID_OTRO_JUGADOR = 'pp:otro';
const ID_GOLES_LISTO = 'pp:golesListo';
const ID_TARJETAS_LISTO = 'pp:tarjetasListo';
const ID_AMARILLA = 'pp:amarilla';
const ID_ROJA = 'pp:roja';

/** Los botones de plantilla más "Otro jugador"/"Listo" reservan estos dos huecos. */
const RESERVA_BOTONES_FIJOS = 2;

// Cada paso pagina la plantilla por separado -- si compartieran una sola
// clave, avanzar de página cargando goleadores dejaría a tarjetas heredando
// esa misma página en vez de arrancar en la 0, escondiendo a los primeros
// jugadores de la plantilla en el selector de tarjetas.
const CLAVE_PAGINA_GOLES = 'paginaGoleadoresPost';
const CLAVE_PAGINA_TARJETAS = 'paginaTarjetasPost';
export const CLAVE_GOLES_POST = 'golesPost';
export const CLAVE_TARJETAS_POST = 'tarjetasPost';
const CLAVE_TARJETA_JUGADOR_ID = 'tarjetaJugadorIdPost';
const CLAVE_TARJETA_JUGADOR_NOMBRE = 'tarjetaJugadorNombrePost';

const TEXTO_LIBRE_RECHAZADO = 'Escribe el nombre (y el dorsal si quieres): Jacob, 10';
const TEXTO_LIBRE_NO_ENTENDIDO = 'No entendí. Escríbelo así: Jacob, 10 (el dorsal es opcional)';

function leerLista(datos: DatosFlujo, clave: string): string[] {
  const valor = datos[clave];

  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Cualquier cosa con barra es un comando, no el nombre de nadie.
 *
 * El router le entrega crudo al flujo cualquier palabra de `COMANDOS_DE_FLUJO`
 * (`/listo`, `/saltar`...) mientras haya una sesión abierta — es lo mismo que
 * usa `pasoCargarPlantilla` para no guardar "/listo@YakoBot" como jugador.
 * Sin esto, "/saltar" pasaba de largo y `parsearJugador` lo tomaba como un
 * nombre válido, creando un jugador real llamado "/saltar".
 */
function esComandoDesconocido(texto: string): boolean {
  return texto.startsWith('/');
}

/** `no_existe`/`partido_cerrado` a mitad de una carga: lo ya insertado queda
 * (cada evento es su propia transacción), pero no tiene sentido seguir
 * preguntando por un partido que ya no admite carga. */
function finSiHizoFalta(
  resultado: ResultadoRegistro,
  ganchos: GanchosPostPartido,
): Transicion | null {
  if (resultado.tipo === 'no_existe') return ganchos.partidoPerdido();

  if (resultado.tipo === 'partido_cerrado') {
    return {
      tipo: 'finalizar',
      respuesta: {
        texto:
          'El partido se cerró mientras cargabas; alcancé a guardar algunos eventos, pero no todos.',
      },
    };
  }

  return null;
}

/** Lo que decide `alElegir` al tocar a alguien de la plantilla: seguir en el
 * mismo paso (releyendo la cuenta ya actualizada) o irse a otro lado. */
type ResultadoElegir = { transicion: Transicion } | { continuar: true };

interface ConfigElegirDeLaPlantilla {
  clavePagina: string;
  claveTally: string;
  idOtroJugador: string;
  idListo: string;
  idLibre: string;
  textoPregunta: string;
  textoListoSinCarga: string;
  jugadores: JugadoresService;
  ganchos: GanchosPostPartido;
  alElegir(ctx: ContextoFlujo, jugador: Jugador): Promise<ResultadoElegir>;
}

/**
 * "Elige a alguien de la plantilla, toca de nuevo si aplica más de una vez,
 * o anda a 'Otro jugador'" — el mecanismo que comparten goleadores y
 * tarjetas, parametrizado solo en qué pasa al elegir a alguien (registrar
 * un gol de una, o pasar a preguntar el color de la tarjeta).
 */
function pasoElegirDeLaPlantilla(
  id: string,
  siguientePasoId: string,
  cfg: ConfigElegirDeLaPlantilla,
): Paso {
  const preguntar = async (
    ctx: ContextoFlujo,
    pagina: number,
    plantillaYaCargada?: Jugador[],
  ): Promise<RespuestaBot> => {
    const plantilla =
      plantillaYaCargada ?? (await cfg.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID)));
    const cargados = leerLista(ctx.datos, cfg.claveTally);

    const { botones } = botonesPaginados(
      plantilla.map((j) => ({ id: `${PREFIJO_JUGADOR}${j.id}`, texto: describirJugador(j) })),
      pagina,
      RESERVA_BOTONES_FIJOS,
    );

    botones.push(
      { id: cfg.idOtroJugador, texto: 'Otro jugador' },
      {
        id: cfg.idListo,
        texto: cargados.length > 0 ? `Listo (${cargados.length})` : cfg.textoListoSinCarga,
      },
    );

    return {
      texto: [cargados.length > 0 ? `Van: ${cargados.join(', ')}.` : undefined, cfg.textoPregunta]
        .filter(Boolean)
        .join('\n\n'),
      botones,
    };
  };

  return {
    id,

    entrar: async (ctx: ContextoFlujo) => ({
      respuesta: await preguntar(ctx, leerNumero(ctx.datos, cfg.clavePagina, 0)),
    }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const seleccion = ctx.mensaje.seleccionId ?? '';
      const pagina = leerNumero(ctx.datos, cfg.clavePagina, 0);

      if (seleccion === ID_VER_MAS) {
        const plantilla = await cfg.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const siguiente = paginaSiguiente(pagina, plantilla.length, RESERVA_BOTONES_FIJOS);

        ctx.datos[cfg.clavePagina] = siguiente;

        return { tipo: 'repetir', respuesta: await preguntar(ctx, siguiente, plantilla) };
      }

      if (seleccion === cfg.idListo) {
        return { tipo: 'ir', pasoId: siguientePasoId, datos: cfg.ganchos.datosPanel(ctx) };
      }

      if (seleccion === cfg.idOtroJugador) {
        return { tipo: 'ir', pasoId: cfg.idLibre, datos: cfg.ganchos.datosPanel(ctx) };
      }

      if (seleccion.startsWith(PREFIJO_JUGADOR)) {
        const plantilla = await cfg.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const jugador = plantilla.find((j) => j.id === seleccion.slice(PREFIJO_JUGADOR.length));

        if (!jugador)
          return { tipo: 'repetir', respuesta: await preguntar(ctx, pagina, plantilla) };

        const resultado = await cfg.alElegir(ctx, jugador);

        if ('transicion' in resultado) return resultado.transicion;

        // Reusa la plantilla ya cargada arriba: nada en `alElegir` la
        // modifica (solo registra un evento o guarda a quién se le va a
        // atribuir la tarjeta), así que no hace falta un tercer SELECT.
        return {
          tipo: 'repetir',
          respuesta: await preguntar(ctx, leerNumero(ctx.datos, cfg.clavePagina, 0), plantilla),
        };
      }

      return { tipo: 'repetir', respuesta: await preguntar(ctx, pagina) };
    },
  };
}

interface ConfigJugadorLibre {
  textoPregunta: string;
  jugadores: JugadoresService;
  ganchos: GanchosPostPartido;
  alResolver(ctx: ContextoFlujo, jugador: Jugador): Promise<Transicion>;
}

/**
 * "Escribe el nombre (y el dorsal si quieres)" — el "Otro jugador" que
 * comparten goleadores y tarjetas para quien no está en la plantilla,
 * parametrizado solo en qué pasa una vez resuelto el jugador.
 */
function pasoJugadorLibre(id: string, cfg: ConfigJugadorLibre): Paso {
  return {
    id,

    entrar: () => Promise.resolve({ respuesta: { texto: cfg.textoPregunta } }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const texto = ctx.mensaje.texto?.trim() ?? '';

      if (esComandoDesconocido(texto)) {
        return { tipo: 'repetir', respuesta: { texto: TEXTO_LIBRE_RECHAZADO } };
      }

      const parseado = texto ? parsearJugador(texto) : null;

      if (!parseado) {
        return { tipo: 'repetir', respuesta: { texto: TEXTO_LIBRE_NO_ENTENDIDO } };
      }

      if (!(await cfg.ganchos.siguePudiendoCargar(ctx))) return cfg.ganchos.sinPermiso();

      const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
      const { jugador } = await cfg.jugadores.resolverOCrear(equipoId, parseado);

      return cfg.alResolver(ctx, jugador);
    },
  };
}

// --- Goleadores ----------------------------------------------------------

export function pasoGoleadoresPost(
  id: string,
  idLibre: string,
  siguientePasoId: string,
  jugadores: JugadoresService,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Paso {
  return pasoElegirDeLaPlantilla(id, siguientePasoId, {
    clavePagina: CLAVE_PAGINA_GOLES,
    claveTally: CLAVE_GOLES_POST,
    idOtroJugador: ID_OTRO_JUGADOR,
    idListo: ID_GOLES_LISTO,
    idLibre,
    textoPregunta: '¿Quién anotó? Toca al goleador — de nuevo si anotó más de uno.',
    textoListoSinCarga: 'Nadie anotó',
    jugadores,
    ganchos,
    alElegir: async (ctx, jugador) => {
      if (!(await ganchos.siguePudiendoCargar(ctx))) return { transicion: ganchos.sinPermiso() };

      const resultado = await eventos.registrar({
        partidoId: ganchos.partidoId(ctx),
        tipo: 'gol',
        equipoOrigen: 'propio',
        jugadorId: jugador.id,
        reportadoPor: ctx.usuarioId ?? '',
        origen: 'post_partido',
      });

      const fin = finSiHizoFalta(resultado, ganchos);

      if (fin) return { transicion: fin };

      ctx.datos[CLAVE_GOLES_POST] = [...leerLista(ctx.datos, CLAVE_GOLES_POST), jugador.nombre];

      return { continuar: true };
    },
  });
}

export function pasoGoleadoresPostLibre(
  id: string,
  volverA: string,
  jugadores: JugadoresService,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Paso {
  return pasoJugadorLibre(id, {
    textoPregunta: 'Escribe el nombre de quien anotó (y el dorsal si quieres): Jacob, 10',
    jugadores,
    ganchos,
    alResolver: async (ctx, jugador) => {
      const resultado = await eventos.registrar({
        partidoId: ganchos.partidoId(ctx),
        tipo: 'gol',
        equipoOrigen: 'propio',
        jugadorId: jugador.id,
        reportadoPor: ctx.usuarioId ?? '',
        origen: 'post_partido',
      });

      const fin = finSiHizoFalta(resultado, ganchos);

      if (fin) return fin;

      return {
        tipo: 'ir',
        pasoId: volverA,
        datos: {
          ...ganchos.datosPanel(ctx),
          [CLAVE_GOLES_POST]: [...leerLista(ctx.datos, CLAVE_GOLES_POST), jugador.nombre],
        },
      };
    },
  });
}

// --- Tarjetas --------------------------------------------------------------

export function pasoTarjetasPost(
  id: string,
  idLibre: string,
  idColor: string,
  siguientePasoId: string,
  jugadores: JugadoresService,
  ganchos: GanchosPostPartido,
): Paso {
  return pasoElegirDeLaPlantilla(id, siguientePasoId, {
    clavePagina: CLAVE_PAGINA_TARJETAS,
    claveTally: CLAVE_TARJETAS_POST,
    idOtroJugador: ID_OTRO_JUGADOR,
    idListo: ID_TARJETAS_LISTO,
    idLibre,
    textoPregunta: '¿Hubo tarjetas? Toca al jugador amonestado o expulsado.',
    textoListoSinCarga: 'Ninguna',
    jugadores,
    ganchos,
    // El color se pregunta aparte: acá solo se guarda a quién se le va a
    // atribuir, `pasoTarjetasPostColor` es quien registra el evento.
    alElegir: (ctx, jugador) =>
      Promise.resolve({
        transicion: {
          tipo: 'ir',
          pasoId: idColor,
          datos: {
            ...ganchos.datosPanel(ctx),
            [CLAVE_TARJETA_JUGADOR_ID]: jugador.id,
            [CLAVE_TARJETA_JUGADOR_NOMBRE]: jugador.nombre,
          },
        },
      }),
  });
}

export function pasoTarjetasPostLibre(
  id: string,
  idColor: string,
  jugadores: JugadoresService,
  ganchos: GanchosPostPartido,
): Paso {
  return pasoJugadorLibre(id, {
    textoPregunta: 'Escribe el nombre de quien vio la tarjeta (y el dorsal si quieres): Jacob, 10',
    jugadores,
    ganchos,
    alResolver: (ctx, jugador) =>
      Promise.resolve({
        tipo: 'ir',
        pasoId: idColor,
        datos: {
          ...ganchos.datosPanel(ctx),
          [CLAVE_TARJETA_JUGADOR_ID]: jugador.id,
          [CLAVE_TARJETA_JUGADOR_NOMBRE]: jugador.nombre,
        },
      }),
  });
}

export function pasoTarjetasPostColor(
  id: string,
  volverA: string,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Paso {
  const preguntar = (ctx: ContextoFlujo): RespuestaBot => {
    const nombre = leerTexto(ctx.datos, CLAVE_TARJETA_JUGADOR_NOMBRE, 'ese jugador');
    const botones: Boton[] = [
      { id: ID_AMARILLA, texto: '🟨 Amarilla' },
      { id: ID_ROJA, texto: '🟥 Roja' },
    ];

    return {
      texto: `¿Amarilla o roja para ${nombre}?`,
      botones,
    };
  };

  return {
    id,

    entrar: (ctx: ContextoFlujo) => Promise.resolve({ respuesta: preguntar(ctx) }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const seleccion = ctx.mensaje.seleccionId ?? '';

      if (seleccion !== ID_AMARILLA && seleccion !== ID_ROJA) {
        return { tipo: 'repetir', respuesta: preguntar(ctx) };
      }

      if (!(await ganchos.siguePudiendoCargar(ctx))) return ganchos.sinPermiso();

      const jugadorId = leerTexto(ctx.datos, CLAVE_TARJETA_JUGADOR_ID);
      const nombre = leerTexto(ctx.datos, CLAVE_TARJETA_JUGADOR_NOMBRE, 'alguien');
      const emoji = seleccion === ID_AMARILLA ? '🟨' : '🟥';

      const resultado = await eventos.registrar({
        partidoId: ganchos.partidoId(ctx),
        tipo: seleccion === ID_AMARILLA ? 'tarjeta_amarilla' : 'tarjeta_roja',
        equipoOrigen: 'propio',
        jugadorId,
        reportadoPor: ctx.usuarioId ?? '',
        origen: 'post_partido',
      });

      const fin = finSiHizoFalta(resultado, ganchos);

      if (fin) return fin;

      return {
        tipo: 'ir',
        pasoId: volverA,
        datos: {
          ...ganchos.datosPanel(ctx),
          [CLAVE_TARJETAS_POST]: [
            ...leerLista(ctx.datos, CLAVE_TARJETAS_POST),
            `${nombre} ${emoji}`,
          ],
        },
      };
    },
  };
}
