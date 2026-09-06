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
 * —la edición del panel y las guardas de permiso/partido perdido—; el resto
 * (equipo, partido) ya viaja en `ctx.datos` gracias a las claves compartidas
 * de `selector-equipo.ts` y `cargar.flujo.ts`.
 *
 * Goleadores y tarjetas se eligen tocando la plantilla, no escribiendo el
 * nombre: cada toque registra un evento y vuelve a la misma pregunta (de
 * nuevo, si anotó o vio tarjeta más de una vez), hasta tocar "Listo". Quien
 * no está en la plantilla entra por "Otro jugador", que sigue aceptando el
 * nombre escrito — no hay plantilla de la que elegir a alguien que no está
 * cargado.
 */
export interface GanchosPostPartido {
  panelId(ctx: ContextoFlujo): string | undefined;
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

const CLAVE_PAGINA = 'paginaJugadoresPost';
export const CLAVE_GOLES_POST = 'golesPost';
export const CLAVE_TARJETAS_POST = 'tarjetasPost';
const CLAVE_TARJETA_JUGADOR_ID = 'tarjetaJugadorIdPost';
const CLAVE_TARJETA_JUGADOR_NOMBRE = 'tarjetaJugadorNombrePost';

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

// --- Goleadores ----------------------------------------------------------

export function pasoGoleadoresPost(
  id: string,
  idLibre: string,
  siguientePasoId: string,
  jugadores: JugadoresService,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Paso {
  const preguntar = async (ctx: ContextoFlujo, pagina: number): Promise<RespuestaBot> => {
    const plantilla = await jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
    const cargados = leerLista(ctx.datos, CLAVE_GOLES_POST);

    const { botones } = botonesPaginados(
      plantilla.map((j) => ({ id: `${PREFIJO_JUGADOR}${j.id}`, texto: describirJugador(j) })),
      pagina,
      RESERVA_BOTONES_FIJOS,
    );

    botones.push(
      { id: ID_OTRO_JUGADOR, texto: 'Otro jugador' },
      {
        id: ID_GOLES_LISTO,
        texto: cargados.length > 0 ? `Listo (${cargados.length})` : 'Nadie anotó',
      },
    );

    return {
      texto: [
        cargados.length > 0 ? `Van: ${cargados.join(', ')}.` : undefined,
        '¿Quién anotó? Toca al goleador — de nuevo si anotó más de uno.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      botones,
      editarMensajeId: ganchos.panelId(ctx),
    };
  };

  /** Registra un gol y repite la misma pregunta con la cuenta actualizada. */
  const registrarGol = async (
    ctx: ContextoFlujo,
    jugadorId: string,
    nombre: string,
  ): Promise<Transicion> => {
    const resultado = await eventos.registrar({
      partidoId: ganchos.partidoId(ctx),
      tipo: 'gol',
      equipoOrigen: 'propio',
      jugadorId,
      reportadoPor: ctx.usuarioId ?? '',
      origen: 'post_partido',
    });

    const fin = finSiHizoFalta(resultado, ganchos);

    if (fin) return fin;

    ctx.datos[CLAVE_GOLES_POST] = [...leerLista(ctx.datos, CLAVE_GOLES_POST), nombre];

    return {
      tipo: 'repetir',
      respuesta: await preguntar(ctx, leerNumero(ctx.datos, CLAVE_PAGINA, 0)),
    };
  };

  return {
    id,

    entrar: async (ctx: ContextoFlujo) => ({
      respuesta: await preguntar(ctx, leerNumero(ctx.datos, CLAVE_PAGINA, 0)),
    }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const seleccion = ctx.mensaje.seleccionId ?? '';
      const pagina = leerNumero(ctx.datos, CLAVE_PAGINA, 0);

      if (seleccion === ID_VER_MAS) {
        const plantilla = await jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const siguiente = paginaSiguiente(pagina, plantilla.length, RESERVA_BOTONES_FIJOS);

        ctx.datos[CLAVE_PAGINA] = siguiente;

        return { tipo: 'repetir', respuesta: await preguntar(ctx, siguiente) };
      }

      if (seleccion === ID_GOLES_LISTO) {
        return { tipo: 'ir', pasoId: siguientePasoId, datos: ganchos.datosPanel(ctx) };
      }

      if (seleccion === ID_OTRO_JUGADOR) {
        return { tipo: 'ir', pasoId: idLibre, datos: ganchos.datosPanel(ctx) };
      }

      if (!(await ganchos.siguePudiendoCargar(ctx))) return ganchos.sinPermiso();

      if (seleccion.startsWith(PREFIJO_JUGADOR)) {
        const plantilla = await jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const jugador = plantilla.find((j) => j.id === seleccion.slice(PREFIJO_JUGADOR.length));

        if (!jugador) return { tipo: 'repetir', respuesta: await preguntar(ctx, pagina) };

        return registrarGol(ctx, jugador.id, jugador.nombre);
      }

      return { tipo: 'repetir', respuesta: await preguntar(ctx, pagina) };
    },
  };
}

export function pasoGoleadoresPostLibre(
  id: string,
  volverA: string,
  jugadores: JugadoresService,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Paso {
  return {
    id,

    entrar: () =>
      Promise.resolve({
        respuesta: {
          texto: 'Escribe el nombre de quien anotó (y el dorsal si quieres): Jacob, 10',
        },
      }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const texto = ctx.mensaje.texto?.trim() ?? '';

      if (esComandoDesconocido(texto)) {
        return {
          tipo: 'repetir',
          respuesta: { texto: 'Escribe el nombre (y el dorsal si quieres): Jacob, 10' },
        };
      }

      const parseado = texto ? parsearJugador(texto) : null;

      if (!parseado) {
        return {
          tipo: 'repetir',
          respuesta: { texto: 'No entendí. Escríbelo así: Jacob, 10 (el dorsal es opcional)' },
        };
      }

      if (!(await ganchos.siguePudiendoCargar(ctx))) return ganchos.sinPermiso();

      const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
      const { jugador } = await jugadores.resolverOCrear(equipoId, parseado);

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
  };
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
  const preguntar = async (ctx: ContextoFlujo, pagina: number): Promise<RespuestaBot> => {
    const plantilla = await jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
    const cargadas = leerLista(ctx.datos, CLAVE_TARJETAS_POST);

    const { botones } = botonesPaginados(
      plantilla.map((j) => ({ id: `${PREFIJO_JUGADOR}${j.id}`, texto: describirJugador(j) })),
      pagina,
      RESERVA_BOTONES_FIJOS,
    );

    botones.push(
      { id: ID_OTRO_JUGADOR, texto: 'Otro jugador' },
      {
        id: ID_TARJETAS_LISTO,
        texto: cargadas.length > 0 ? `Listo (${cargadas.length})` : 'Ninguna',
      },
    );

    return {
      texto: [
        cargadas.length > 0 ? `Van: ${cargadas.join(', ')}.` : undefined,
        '¿Hubo tarjetas? Toca al jugador amonestado o expulsado.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      botones,
      editarMensajeId: ganchos.panelId(ctx),
    };
  };

  return {
    id,

    entrar: async (ctx: ContextoFlujo) => ({
      respuesta: await preguntar(ctx, leerNumero(ctx.datos, CLAVE_PAGINA, 0)),
    }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const seleccion = ctx.mensaje.seleccionId ?? '';
      const pagina = leerNumero(ctx.datos, CLAVE_PAGINA, 0);

      if (seleccion === ID_VER_MAS) {
        const plantilla = await jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const siguiente = paginaSiguiente(pagina, plantilla.length, RESERVA_BOTONES_FIJOS);

        ctx.datos[CLAVE_PAGINA] = siguiente;

        return { tipo: 'repetir', respuesta: await preguntar(ctx, siguiente) };
      }

      if (seleccion === ID_TARJETAS_LISTO) {
        return { tipo: 'ir', pasoId: siguientePasoId, datos: ganchos.datosPanel(ctx) };
      }

      if (seleccion === ID_OTRO_JUGADOR) {
        return { tipo: 'ir', pasoId: idLibre, datos: ganchos.datosPanel(ctx) };
      }

      if (seleccion.startsWith(PREFIJO_JUGADOR)) {
        const plantilla = await jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const jugador = plantilla.find((j) => j.id === seleccion.slice(PREFIJO_JUGADOR.length));

        if (!jugador) return { tipo: 'repetir', respuesta: await preguntar(ctx, pagina) };

        // El color se pregunta aparte: acá solo se guarda a quién se le va a
        // atribuir, `pasoTarjetasPostColor` es quien registra el evento.
        return {
          tipo: 'ir',
          pasoId: idColor,
          datos: {
            ...ganchos.datosPanel(ctx),
            [CLAVE_TARJETA_JUGADOR_ID]: jugador.id,
            [CLAVE_TARJETA_JUGADOR_NOMBRE]: jugador.nombre,
          },
        };
      }

      return { tipo: 'repetir', respuesta: await preguntar(ctx, pagina) };
    },
  };
}

export function pasoTarjetasPostLibre(
  id: string,
  idColor: string,
  jugadores: JugadoresService,
  ganchos: GanchosPostPartido,
): Paso {
  return {
    id,

    entrar: () =>
      Promise.resolve({
        respuesta: {
          texto: 'Escribe el nombre de quien vio la tarjeta (y el dorsal si quieres): Jacob, 10',
        },
      }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const texto = ctx.mensaje.texto?.trim() ?? '';

      if (esComandoDesconocido(texto)) {
        return {
          tipo: 'repetir',
          respuesta: {
            texto: 'Escribe el nombre (y el dorsal si quieres): Jacob, 10',
          },
        };
      }

      const parseado = texto ? parsearJugador(texto) : null;

      if (!parseado) {
        return {
          tipo: 'repetir',
          respuesta: { texto: 'No entendí. Escríbelo así: Jacob, 10 (el dorsal es opcional)' },
        };
      }

      const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
      const { jugador } = await jugadores.resolverOCrear(equipoId, parseado);

      return {
        tipo: 'ir',
        pasoId: idColor,
        datos: {
          ...ganchos.datosPanel(ctx),
          [CLAVE_TARJETA_JUGADOR_ID]: jugador.id,
          [CLAVE_TARJETA_JUGADOR_NOMBRE]: jugador.nombre,
        },
      };
    },
  };
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
      editarMensajeId: ganchos.panelId(ctx),
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
