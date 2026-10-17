import type { Boton, RespuestaBot } from '../channels/channel.types';
import type {
  ContextoFlujo,
  DatosFlujo,
  Entrada,
  Paso,
  Transicion,
} from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import { pasoSeleccionMultiple } from '../conversacion/pasos-comunes/seleccion-multiple';
import { describirJugador, type JugadoresService } from '../jugadores/jugadores.service';
import type { AlineacionService } from '../partidos/alineacion.service';
import type { Partido } from '../partidos/partido.mapper';
import type { EventoCargado, EventosService } from './eventos.service';
import { describirEvento, lineaDeBitacora } from './mensajes';

/**
 * "✏️ Corregir" de `/cargar`, para un partido reabierto con `/reabrir`.
 *
 * Cubre lo que "Deshacer" (solo el último evento) y "Corregir todo" de post
 * partido (que conserva quiénes jugaron) no alcanzan: sacar a alguien que
 * quedó como que jugó sin haber jugado, sumar a quien faltó, y borrar
 * cualquier evento, no solo el último. Solo un admin —el mismo rol que
 * puede reabrir—, revalidado antes de cada escritura.
 */
export const PASOS_CORREGIR = {
  menu: 'corregir',
  participantes: 'corregir-participantes',
  eventos: 'corregir-eventos',
  confirmarBorrado: 'corregir-confirmar-borrado',
} as const;

const ID_PARTICIPANTES = 'cr:jugaron';
const ID_EVENTOS = 'cr:eventos';
const ID_VOLVER = 'cr:volver';
const ID_MENU = 'cr:menu';
const ID_BORRAR_SI = 'cr:si';
const ID_BORRAR_NO = 'cr:no';
/** `cr:b:` + uuid = 41 bytes, dentro de los 64 de Telegram. */
const PREFIJO_BORRAR = 'cr:b:';
const PREFIJO_JUGADOR = 'jg:';

const CLAVE_EVENTO = 'corregirEventoId';
const CLAVE_AVISO = 'corregirAviso';

/** Lo que estos pasos necesitan prestado de `CargarFlujo`. */
export interface GanchosCorregir {
  partidoDe(ctx: ContextoFlujo): Promise<Partido | null>;
  equipoId(ctx: ContextoFlujo): string;
  equipoNombre(ctx: ContextoFlujo): string;
  esAdmin(ctx: ContextoFlujo): Promise<boolean>;
  /** Vuelve a donde se tocó "✏️ Corregir" (panel en vivo o reentrada post partido). */
  volver(ctx: ContextoFlujo): Transicion;
  partidoPerdido(): Transicion;
  datosPanel(ctx: ContextoFlujo): DatosFlujo;
}

export interface DependenciasCorregir {
  eventos: EventosService;
  alineacion: AlineacionService;
  jugadores: JugadoresService;
  ganchos: GanchosCorregir;
}

const SOLO_ADMIN = 'Solo un admin puede corregir un partido.';

export function pasosCorregir(deps: DependenciasCorregir): Paso[] {
  return [pasoMenu(deps), pasoParticipantes(deps), pasoEventos(deps), pasoConfirmarBorrado(deps)];
}

/** Lee y descarta el aviso que dejó el paso anterior ("✅ Se borró…"). */
function tomarAviso(ctx: ContextoFlujo): string | undefined {
  const aviso = leerTexto(ctx.datos, CLAVE_AVISO);

  ctx.datos[CLAVE_AVISO] = '';

  return aviso || undefined;
}

function irA(
  deps: DependenciasCorregir,
  ctx: ContextoFlujo,
  pasoId: string,
  datos: DatosFlujo = {},
): Transicion {
  return { tipo: 'ir', pasoId, datos: { ...deps.ganchos.datosPanel(ctx), ...datos } };
}

/**
 * Lo común a cada paso: el partido tiene que seguir abierto y quien corrige
 * seguir siendo admin. Devuelve la transición de salida si algo no cuadra.
 */
async function validar(
  deps: DependenciasCorregir,
  ctx: ContextoFlujo,
): Promise<{ partido: Partido } | { salida: Transicion }> {
  const partido = await deps.ganchos.partidoDe(ctx);

  if (!partido) return { salida: deps.ganchos.partidoPerdido() };

  if (partido.estado === 'cerrado') {
    return {
      salida: {
        tipo: 'finalizar',
        respuesta: { texto: 'Ese partido ya está cerrado. Para corregirlo, primero /reabrir.' },
      },
    };
  }

  // `/cargar` ya lo chequeó al tocar "✏️ Corregir"; esto cubre que le
  // hayan quitado el rol a mitad de la corrección (la sesión dura una hora).
  if (!(await deps.ganchos.esAdmin(ctx))) {
    return { salida: { tipo: 'finalizar', respuesta: { texto: SOLO_ADMIN } } };
  }

  return { partido };
}

function pasoMenu(deps: DependenciasCorregir): Paso {
  const preguntar = (ctx: ContextoFlujo, partido: Partido): RespuestaBot => ({
    texto: [
      tomarAviso(ctx),
      `✏️ Corregir ${deps.ganchos.equipoNombre(ctx)} vs ${partido.rival}`,
      '',
      '¿Qué quieres corregir?',
    ]
      .filter((linea) => linea !== undefined)
      .join('\n'),
    botones: [
      { id: ID_PARTICIPANTES, texto: '👥 Quiénes jugaron' },
      { id: ID_EVENTOS, texto: '🗑️ Borrar un evento' },
      { id: ID_VOLVER, texto: '↩️ Volver' },
    ],
  });

  return {
    id: PASOS_CORREGIR.menu,

    entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
      const validado = await validar(deps, ctx);

      if ('salida' in validado) return { transicion: validado.salida };

      return { respuesta: preguntar(ctx, validado.partido) };
    },

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const seleccion = ctx.mensaje.seleccionId ?? '';

      if (seleccion === ID_PARTICIPANTES) return irA(deps, ctx, PASOS_CORREGIR.participantes);
      if (seleccion === ID_EVENTOS) return irA(deps, ctx, PASOS_CORREGIR.eventos);
      if (seleccion === ID_VOLVER) return deps.ganchos.volver(ctx);

      const validado = await validar(deps, ctx);

      if ('salida' in validado) return validado.salida;

      return { tipo: 'repetir', respuesta: preguntar(ctx, validado.partido) };
    },
  };
}

/**
 * Quiénes jugaron, con los actuales ya marcados: se desmarca a quien no
 * jugó y se marca a quien faltó. La lista es la plantilla activa más quien
 * ya figuraba en el partido aunque hoy esté inactivo.
 *
 * Quien jugó porque entró por cambio, o porque tiene eventos propios,
 * sigue contando como que jugó aunque se lo desmarque: eso sale de los
 * eventos, no de esta lista. Se avisa con su nombre para que borre esos
 * eventos en "🗑️ Borrar un evento".
 */
function pasoParticipantes(deps: DependenciasCorregir): Paso {
  const participantes = async (ctx: ContextoFlujo): Promise<string[]> => {
    const partido = await deps.ganchos.partidoDe(ctx);

    if (!partido) return [];

    const { participantes: ids } = await deps.alineacion.datosDeParticipacion(partido.id, 0);

    return ids;
  };

  return pasoSeleccionMultiple(PASOS_CORREGIR.participantes, {
    pregunta: '👥 ¿Quiénes jugaron? Desmarca a quien no jugó y marca a quien faltó.',
    textoConfirmar: 'Guardar',

    obtenerOpciones: async (ctx) => {
      const [plantilla, actuales] = await Promise.all([
        deps.jugadores.listar(deps.ganchos.equipoId(ctx), true),
        participantes(ctx),
      ]);

      return plantilla
        .filter((j) => j.activo || actuales.includes(j.id))
        .map((j) => ({ id: `${PREFIJO_JUGADOR}${j.id}`, texto: describirJugador(j) }));
    },

    seleccionInicial: async (ctx) =>
      (await participantes(ctx)).map((id) => `${PREFIJO_JUGADOR}${id}`),

    alConfirmar: async (ctx, elegidos) => {
      const validado = await validar(deps, ctx);

      if ('salida' in validado) return validado.salida;

      const { partido } = validado;
      const elegidosIds = elegidos.map((id) => id.slice(PREFIJO_JUGADOR.length));
      const [{ participantes: actuales, titulares }, plantilla, cargados] = await Promise.all([
        deps.alineacion.datosDeParticipacion(partido.id, 0),
        deps.jugadores.listar(partido.equipoId, true),
        deps.eventos.delPartido(partido.id),
      ]);

      const quitar = titulares.filter((id) => !elegidosIds.includes(id));
      const agregar = elegidosIds.filter((id) => !actuales.includes(id));

      await deps.alineacion.ajustarParticipantes(partido.id, ctx.usuarioId ?? '', {
        agregar,
        quitar,
      });

      const nombre = (id: string): string => {
        const jugador = plantilla.find((j) => j.id === id);

        return jugador ? describirJugador(jugador) : 'Sin nombre';
      };
      // Desmarcados que igual siguen contando como que jugaron.
      const conEventos = actuales
        .filter((id) => !elegidosIds.includes(id))
        .filter((id) => cargados.some((e) => e.jugadorId === id || e.jugadorEntraId === id));

      const lineas = [
        agregar.length === 0 && quitar.length === 0
          ? 'No cambió nada en quiénes jugaron.'
          : '✅ Guardado.',
      ];

      if (quitar.length > 0) lineas.push(`Ya no jugaron: ${quitar.map(nombre).join(', ')}.`);
      if (agregar.length > 0) lineas.push(`Ahora jugaron: ${agregar.map(nombre).join(', ')}.`);

      if (conEventos.length > 0) {
        lineas.push(
          `⚠️ ${conEventos.map(nombre).join(', ')} todavía tiene eventos cargados (o entró por cambio) y sigue contando como que jugó: bórralos en "🗑️ Borrar un evento".`,
        );
      }

      return irA(deps, ctx, PASOS_CORREGIR.menu, { [CLAVE_AVISO]: lineas.join('\n') });
    },
  });
}

/**
 * Todos los eventos del partido, numerados en el texto —cada línea entera,
 * que en un botón no entraría— y un botón corto por número para borrarlo.
 */
function pasoEventos(deps: DependenciasCorregir): Paso {
  const preguntar = (
    ctx: ContextoFlujo,
    partido: Partido,
    cargados: readonly EventoCargado[],
  ): RespuestaBot => {
    const equipoNombre = deps.ganchos.equipoNombre(ctx);
    const aviso = tomarAviso(ctx);

    if (cargados.length === 0) {
      return {
        texto: [aviso, 'No hay eventos cargados en este partido.'].filter(Boolean).join('\n\n'),
        botones: [{ id: ID_MENU, texto: '↩️ Volver' }],
      };
    }

    const lineas = cargados.map(
      (evento, i) => `${i + 1}. ${describirEvento(evento, equipoNombre, partido.rival)}`,
    );
    const botones: Boton[] = cargados.map((evento, i) => ({
      id: `${PREFIJO_BORRAR}${evento.id}`,
      texto: `🗑️ ${i + 1}`,
    }));

    return {
      texto: [aviso, '🗑️ ¿Cuál evento borro?', '', ...lineas]
        .filter((l) => l !== undefined)
        .join('\n'),
      botones: [...botones, { id: ID_MENU, texto: '↩️ Volver' }],
    };
  };

  return {
    id: PASOS_CORREGIR.eventos,

    entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
      const validado = await validar(deps, ctx);

      if ('salida' in validado) return { transicion: validado.salida };

      const cargados = await deps.eventos.delPartido(validado.partido.id);

      return { respuesta: preguntar(ctx, validado.partido, cargados) };
    },

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const seleccion = ctx.mensaje.seleccionId ?? '';

      if (seleccion === ID_MENU) return irA(deps, ctx, PASOS_CORREGIR.menu);

      const validado = await validar(deps, ctx);

      if ('salida' in validado) return validado.salida;

      const cargados = await deps.eventos.delPartido(validado.partido.id);
      const elegido = seleccion.startsWith(PREFIJO_BORRAR)
        ? cargados.find((e) => e.id === seleccion.slice(PREFIJO_BORRAR.length))
        : undefined;

      if (elegido) {
        return irA(deps, ctx, PASOS_CORREGIR.confirmarBorrado, { [CLAVE_EVENTO]: elegido.id });
      }

      return { tipo: 'repetir', respuesta: preguntar(ctx, validado.partido, cargados) };
    },
  };
}

/** Confirmación antes de borrar: un toque equivocado en la lista no borra nada solo. */
function pasoConfirmarBorrado(deps: DependenciasCorregir): Paso {
  const eventoElegido = async (
    ctx: ContextoFlujo,
    partido: Partido,
  ): Promise<EventoCargado | undefined> => {
    const cargados = await deps.eventos.delPartido(partido.id);

    return cargados.find((e) => e.id === leerTexto(ctx.datos, CLAVE_EVENTO));
  };

  const volverALista = (ctx: ContextoFlujo, aviso?: string): Transicion =>
    irA(deps, ctx, PASOS_CORREGIR.eventos, aviso ? { [CLAVE_AVISO]: aviso } : {});

  return {
    id: PASOS_CORREGIR.confirmarBorrado,

    entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
      const validado = await validar(deps, ctx);

      if ('salida' in validado) return { transicion: validado.salida };

      const evento = await eventoElegido(ctx, validado.partido);

      if (!evento) {
        return { transicion: volverALista(ctx, 'Ese evento ya no está cargado.') };
      }

      return {
        respuesta: {
          texto: [
            '¿Borro este evento?',
            describirEvento(evento, deps.ganchos.equipoNombre(ctx), validado.partido.rival),
          ].join('\n'),
          botones: [
            { id: ID_BORRAR_SI, texto: '🗑️ Sí, borrar' },
            { id: ID_BORRAR_NO, texto: 'No' },
          ],
        },
      };
    },

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      if (ctx.mensaje.seleccionId !== ID_BORRAR_SI) return volverALista(ctx);

      const validado = await validar(deps, ctx);

      if ('salida' in validado) return validado.salida;

      const resultado = await deps.eventos.borrar(
        validado.partido.id,
        leerTexto(ctx.datos, CLAVE_EVENTO),
        ctx.usuarioId ?? '',
      );

      switch (resultado.tipo) {
        case 'borrado':
          return volverALista(
            ctx,
            `🗑️ Se borró: ${lineaDeBitacora(
              resultado.evento,
              resultado.marcador,
              deps.ganchos.equipoNombre(ctx),
              validado.partido.rival,
            )}`,
          );
        case 'ya_no_esta':
          return volverALista(ctx, 'Ese evento ya no está cargado.');
        case 'partido_cerrado':
          return {
            tipo: 'finalizar',
            respuesta: { texto: 'Ese partido se cerró mientras corregías; no borré nada.' },
          };
        default:
          return deps.ganchos.partidoPerdido();
      }
    },
  };
}
