import type { RespuestaBot } from '../channels/channel.types';
import { CLAVE_EQUIPO_ID } from '../conversacion/pasos-comunes/selector-equipo';
import type { ContextoFlujo, DatosFlujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import {
  type GoleadorParseado,
  type JugadoresService,
  parsearGoleadores,
  parsearTarjetas,
  type TarjetaParseada,
} from '../jugadores/jugadores.service';
import { type EventosService, type ResultadoRegistro } from './eventos.service';

/**
 * Pasos de la carga post partido (RF-4.1: marcador, goleadores y tarjetas,
 * sin minuto ni tiempos).
 *
 * Viven en su propio archivo por tamaño: `cargar.flujo.ts` ya es grande, y
 * estos dos pasos se plantan tal cual dentro de su mismo `FLUJO_CARGAR` (una
 * sesión de post partido pasa por `pasoModo` igual que la de en vivo). Los
 * ganchos que reciben son la parte de `CargarFlujo` que sí hay que compartir
 * —la edición del panel y las guardas de permiso/partido perdido—; el resto
 * (equipo, partido) ya viaja en `ctx.datos` gracias a las claves compartidas
 * de `selector-equipo.ts` y `cargar.flujo.ts`.
 */
export interface GanchosPostPartido {
  panelId(ctx: ContextoFlujo): string | undefined;
  datosPanel(ctx: ContextoFlujo): DatosFlujo;
  partidoId(ctx: ContextoFlujo): string;
  siguePudiendoCargar(ctx: ContextoFlujo): Promise<boolean>;
  sinPermiso(): Transicion;
  partidoPerdido(): Transicion;
}

/** "/ninguna", "ninguno" (o vacío): no hay nada que cargar en este paso. */
function esNinguno(texto: string): boolean {
  const limpio = texto.trim().toLowerCase().replace(/^\//, '');

  return limpio === '' || limpio === 'ninguno' || limpio === 'ninguna';
}

/**
 * Cualquier otra cosa con barra es un comando, no el nombre de nadie.
 *
 * El router le entrega crudo al flujo cualquier palabra de `COMANDOS_DE_FLUJO`
 * (`/listo`, `/saltar`...) mientras haya una sesión abierta — es lo mismo que
 * usa `pasoCargarPlantilla` para no guardar "/listo@YakoBot" como jugador.
 * Sin esto, "/saltar" pasaba de largo por `esNinguno`, `parsearJugador` lo
 * tomaba como un nombre válido y creaba un jugador real llamado "/saltar".
 */
function esComandoDesconocido(texto: string): boolean {
  return texto.startsWith('/') && !esNinguno(texto);
}

export function pasoGoleadoresPost(
  id: string,
  siguientePasoId: string,
  jugadores: JugadoresService,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Paso {
  const preguntar = (ctx: ContextoFlujo): RespuestaBot => ({
    texto: '¿Quién anotó? Escríbelo así: Jacob 2, Andrés 1 (o /ninguna si no marcaron).',
    editarMensajeId: ganchos.panelId(ctx),
  });

  return {
    id,

    entrar: (ctx: ContextoFlujo) => Promise.resolve({ respuesta: preguntar(ctx) }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const texto = ctx.mensaje.texto?.trim() ?? '';

      if (esComandoDesconocido(texto)) {
        return {
          tipo: 'repetir',
          respuesta: {
            texto: 'Para saltar escribe /ninguna. Para cargar, escribe así: Jacob 2, Andrés 1',
            editarMensajeId: ganchos.panelId(ctx),
          },
        };
      }

      const goleadores: GoleadorParseado[] | null = esNinguno(texto)
        ? []
        : parsearGoleadores(texto);

      if (goleadores === null) {
        return {
          tipo: 'repetir',
          respuesta: {
            texto: 'No entendí. Escríbelo así: Jacob 2, Andrés 1',
            editarMensajeId: ganchos.panelId(ctx),
          },
        };
      }

      if (!(await ganchos.siguePudiendoCargar(ctx))) return ganchos.sinPermiso();

      const resultado = await cargarGoles(ctx, goleadores, jugadores, eventos, ganchos);

      if (resultado) return resultado;

      return { tipo: 'ir', pasoId: siguientePasoId, datos: ganchos.datosPanel(ctx) };
    },
  };
}

export function pasoTarjetasPost(
  id: string,
  siguientePasoId: string,
  jugadores: JugadoresService,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Paso {
  const preguntar = (ctx: ContextoFlujo): RespuestaBot => ({
    texto: '¿Hubo tarjetas? Escríbelo así: Andrés amarilla, Jacob roja (o /ninguna).',
    editarMensajeId: ganchos.panelId(ctx),
  });

  return {
    id,

    entrar: (ctx: ContextoFlujo) => Promise.resolve({ respuesta: preguntar(ctx) }),

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const texto = ctx.mensaje.texto?.trim() ?? '';

      if (esComandoDesconocido(texto)) {
        return {
          tipo: 'repetir',
          respuesta: {
            texto:
              'Para saltar escribe /ninguna. Para cargar, escribe así: Andrés amarilla, Jacob roja',
            editarMensajeId: ganchos.panelId(ctx),
          },
        };
      }

      const tarjetas: TarjetaParseada[] | null = esNinguno(texto) ? [] : parsearTarjetas(texto);

      if (tarjetas === null) {
        return {
          tipo: 'repetir',
          respuesta: {
            texto: 'No entendí. Escríbelo así: Andrés amarilla, Jacob roja',
            editarMensajeId: ganchos.panelId(ctx),
          },
        };
      }

      if (!(await ganchos.siguePudiendoCargar(ctx))) return ganchos.sinPermiso();

      const resultado = await cargarTarjetas(ctx, tarjetas, jugadores, eventos, ganchos);

      if (resultado) return resultado;

      return { tipo: 'ir', pasoId: siguientePasoId, datos: ganchos.datosPanel(ctx) };
    },
  };
}

/** Devuelve una transición solo si algo salió mal a mitad de camino. */
async function cargarGoles(
  ctx: ContextoFlujo,
  goleadores: GoleadorParseado[],
  jugadores: JugadoresService,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Promise<Transicion | null> {
  const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
  const partidoId = ganchos.partidoId(ctx);

  for (const goleador of goleadores) {
    const { jugador } = await jugadores.resolverOCrear(equipoId, { nombre: goleador.nombre });

    for (let i = 0; i < goleador.cantidad; i++) {
      const resultado = await eventos.registrar({
        partidoId,
        tipo: 'gol',
        equipoOrigen: 'propio',
        jugadorId: jugador.id,
        reportadoPor: ctx.usuarioId ?? '',
        origen: 'post_partido',
      });

      const fin = finSiHizoFalta(resultado, ganchos);

      if (fin) return fin;
    }
  }

  return null;
}

async function cargarTarjetas(
  ctx: ContextoFlujo,
  tarjetas: TarjetaParseada[],
  jugadores: JugadoresService,
  eventos: EventosService,
  ganchos: GanchosPostPartido,
): Promise<Transicion | null> {
  const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
  const partidoId = ganchos.partidoId(ctx);

  for (const tarjeta of tarjetas) {
    const { jugador } = await jugadores.resolverOCrear(equipoId, { nombre: tarjeta.nombre });

    const resultado = await eventos.registrar({
      partidoId,
      tipo: tarjeta.color === 'amarilla' ? 'tarjeta_amarilla' : 'tarjeta_roja',
      equipoOrigen: 'propio',
      jugadorId: jugador.id,
      reportadoPor: ctx.usuarioId ?? '',
      origen: 'post_partido',
    });

    const fin = finSiHizoFalta(resultado, ganchos);

    if (fin) return fin;
  }

  return null;
}

/**
 * `no_existe`/`partido_cerrado` a mitad de una carga en bloque: lo ya
 * insertado queda (cada evento es su propia transacción), pero no tiene
 * sentido seguir preguntando por un partido que ya no admite carga.
 */
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
