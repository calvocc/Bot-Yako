import { Injectable } from '@nestjs/common';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import type {
  ContextoFlujo,
  DatosFlujo,
  Entrada,
  Flujo,
  Paso,
  Transicion,
} from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import {
  describirFormato,
  EquiposService,
  LIMITES_FORMATO,
  parsearFormato,
  type FormatoPartido,
} from '../equipos/equipos.service';
import { MembresiasService } from '../identidad/membresias.service';
import { describirFecha, hoyLocal, parsearFecha, sumarDias } from './fechas';
import { PartidosService } from './partidos.service';

export const FLUJO_NUEVO_PARTIDO = 'nuevo-partido';

const PASOS = {
  equipo: 'equipo',
  rival: 'rival',
  fecha: 'fecha',
  competencia: 'competencia',
  competenciaLibre: 'competencia-libre',
  formato: 'formato',
  formatoCustom: 'formato-custom',
} as const;

const CLAVE_RIVAL = 'rival';
const CLAVE_FECHA = 'fecha';
const CLAVE_COMPETENCIA = 'competencia';
const CLAVE_TIEMPOS = 'cantidadTiempos';
const CLAVE_MINUTOS = 'minutosPorTiempo';
/** Las opciones que de verdad se mostraron, para que `co:{i}` no dependa de
 * volver a consultarlas — ver `pasoCompetencia`. */
const CLAVE_OPCIONES_COMPETENCIA = 'opcionesCompetencia';

const PREFIJO_FECHA = 'fe:';
const PREFIJO_COMPETENCIA = 'co:';
const ID_COMPETENCIA_OTRA = 'co:otra';
const ID_COMPETENCIA_NINGUNA = 'co:ninguna';
const ID_FORMATO_HABITUAL = 'fmt:habitual';
const ID_FORMATO_OTRO = 'fmt:otro';

/** Competencias que se ofrecen cuando el equipo todavía no jugó nada. */
const COMPETENCIAS_INICIALES = ['Liga', 'Torneo', 'Amistoso'];

@Injectable()
export class NuevoPartidoFlujo {
  constructor(
    private readonly partidos: PartidosService,
    private readonly equipos: EquiposService,
    private readonly membresias: MembresiasService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_NUEVO_PARTIDO,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.rival,
          rolMinimo: 'editor',
          pregunta: '¿De qué equipo es el partido?',
        }),
        this.pasoRival(),
        this.pasoFecha(),
        this.pasoCompetencia(),
        this.pasoCompetenciaLibre(),
        this.pasoFormato(),
        this.pasoFormatoCustom(),
      ],
    };
  }

  private pasoRival(): Paso {
    return {
      id: PASOS.rival,

      entrar: () =>
        Promise.resolve({
          respuesta: { texto: 'Vamos a crear un partido. ¿Contra quién juegan?' },
        }),

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const rival = ctx.mensaje.texto?.trim();

        if (!rival) {
          return Promise.resolve({
            tipo: 'repetir',
            respuesta: { texto: 'Necesito el nombre del rival.' },
          });
        }

        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.fecha,
          datos: { [CLAVE_RIVAL]: rival },
        });
      },
    };
  }

  private pasoFecha(): Paso {
    const hoy = () => hoyLocal();

    return {
      id: PASOS.fecha,

      entrar: () => {
        const dia = hoy();

        return Promise.resolve({
          respuesta: {
            texto: '¿Qué día se juega? Toca una opción o escribe la fecha (12-10).',
            botones: [
              { id: `${PREFIJO_FECHA}${dia}`, texto: 'Hoy' },
              { id: `${PREFIJO_FECHA}${sumarDias(dia, -1)}`, texto: 'Ayer' },
              { id: `${PREFIJO_FECHA}${sumarDias(dia, 1)}`, texto: 'Mañana' },
            ],
          },
        });
      },

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;
        const fecha = seleccion?.startsWith(PREFIJO_FECHA)
          ? seleccion.slice(PREFIJO_FECHA.length)
          : parsearFecha(ctx.mensaje.texto ?? '', hoy());

        if (!fecha) {
          return Promise.resolve({
            tipo: 'repetir',
            respuesta: { texto: 'No entendí la fecha. Escríbela así: 12-10 (o "hoy").' },
          });
        }

        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.competencia,
          datos: { [CLAVE_FECHA]: fecha },
        });
      },
    };
  }

  /**
   * `co:{i}` es un índice posicional sobre esta lista, y por eso `recibir`
   * usa exactamente la que se guardó al mostrar los botones (`entrar`, o el
   * `repetir` anterior) en vez de volver a consultarla: si otro padre crea
   * un partido con una competencia nueva entre la pregunta y la respuesta,
   * `max(fecha) desc` reordena y el índice pasaría a apuntar a otra
   * competencia sin que nadie lo note.
   */
  private pasoCompetencia(): Paso {
    const opciones = async (ctx: ContextoFlujo): Promise<string[]> => {
      const usadas = await this.partidos.competenciasDe(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));

      return usadas.length > 0 ? usadas : COMPETENCIAS_INICIALES;
    };

    const botones = (lista: string[]) => [
      ...lista.map((nombre, i) => ({
        id: `${PREFIJO_COMPETENCIA}${i}`,
        texto: nombre.slice(0, 20),
      })),
      { id: ID_COMPETENCIA_OTRA, texto: 'Otra' },
      { id: ID_COMPETENCIA_NINGUNA, texto: 'Sin competencia' },
    ];

    return {
      id: PASOS.competencia,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const lista = await opciones(ctx);

        ctx.datos[CLAVE_OPCIONES_COMPETENCIA] = lista;

        return { respuesta: { texto: '¿En qué competencia?', botones: botones(lista) } };
      },

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;

        if (seleccion === ID_COMPETENCIA_OTRA) {
          return Promise.resolve({ tipo: 'ir', pasoId: PASOS.competenciaLibre });
        }

        if (seleccion === ID_COMPETENCIA_NINGUNA) {
          return Promise.resolve({
            tipo: 'ir',
            pasoId: PASOS.formato,
            datos: { [CLAVE_COMPETENCIA]: '' },
          });
        }

        const lista = leerListaTexto(ctx.datos, CLAVE_OPCIONES_COMPETENCIA);
        const elegida = seleccion?.startsWith(PREFIJO_COMPETENCIA)
          ? lista[Number(seleccion.slice(PREFIJO_COMPETENCIA.length))]
          : ctx.mensaje.texto?.trim();

        if (!elegida) {
          return Promise.resolve({
            tipo: 'repetir',
            respuesta: { texto: 'Toca una opción o escribe el nombre:', botones: botones(lista) },
            datos: { [CLAVE_OPCIONES_COMPETENCIA]: lista },
          });
        }

        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.formato,
          datos: { [CLAVE_COMPETENCIA]: elegida },
        });
      },
    };
  }

  private pasoCompetenciaLibre(): Paso {
    return {
      id: PASOS.competenciaLibre,

      entrar: () => Promise.resolve({ respuesta: { texto: '¿Cómo se llama la competencia?' } }),

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const nombre = ctx.mensaje.texto?.trim();

        if (!nombre) {
          return Promise.resolve({
            tipo: 'repetir',
            respuesta: { texto: 'Escribe el nombre de la competencia.' },
          });
        }

        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.formato,
          datos: { [CLAVE_COMPETENCIA]: nombre },
        });
      },
    };
  }

  private pasoFormato(): Paso {
    return {
      id: PASOS.formato,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const habitual = await this.formatoHabitual(ctx);

        return {
          respuesta: {
            texto: `¿Formato del partido? El del equipo es ${describirFormato(habitual)}.`,
            botones: [
              { id: ID_FORMATO_HABITUAL, texto: 'El de siempre' },
              { id: ID_FORMATO_OTRO, texto: 'Otro para este' },
            ],
          },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;

        if (seleccion === ID_FORMATO_OTRO) return { tipo: 'ir', pasoId: PASOS.formatoCustom };

        if (seleccion === ID_FORMATO_HABITUAL) {
          return this.crear(ctx, await this.formatoHabitual(ctx));
        }

        // También se acepta escrito, que es más rápido que buscar el botón.
        const escrito = parsearFormato(ctx.mensaje.texto ?? '');

        return escrito ? this.crear(ctx, escrito) : { tipo: 'ir', pasoId: PASOS.formatoCustom };
      },
    };
  }

  private pasoFormatoCustom(): Paso {
    return {
      id: PASOS.formatoCustom,

      entrar: () =>
        Promise.resolve({
          respuesta: {
            texto: `Escribe "tiempos x minutos", por ejemplo: 3 x 20\n\n(${LIMITES_FORMATO.tiemposMin}-${LIMITES_FORMATO.tiemposMax} tiempos, ${LIMITES_FORMATO.minutosMin}-${LIMITES_FORMATO.minutosMax} minutos)`,
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const formato = parsearFormato(ctx.mensaje.texto ?? '');

        if (!formato) {
          return { tipo: 'repetir', respuesta: { texto: 'No lo entendí. Escríbelo así: 3 x 20' } };
        }

        return this.crear(ctx, formato);
      },
    };
  }

  /**
   * El formato del equipo, con respaldo en los datos del flujo.
   *
   * Se relee del equipo en vez de arrastrarlo desde el primer paso: si el admin
   * lo cambió mientras tanto, lo correcto es el nuevo.
   */
  private async formatoHabitual(ctx: ContextoFlujo): Promise<FormatoPartido> {
    const equipo = await this.equipos.obtener(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));

    if (equipo) {
      return {
        cantidadTiempos: equipo.cantidadTiemposDefault,
        minutosPorTiempo: equipo.minutosPorTiempoDefault,
      };
    }

    return {
      cantidadTiempos: leerNumero(ctx.datos, CLAVE_TIEMPOS, 2),
      minutosPorTiempo: leerNumero(ctx.datos, CLAVE_MINUTOS, 25),
    };
  }

  private async crear(ctx: ContextoFlujo, formato: FormatoPartido): Promise<Transicion> {
    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);

    // Entre elegir el equipo y confirmar el formato pueden pasar minutos, y la
    // sesión dura una hora: el permiso se vuelve a comprobar antes de escribir.
    const puede = ctx.usuarioId
      ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
      : false;

    if (!puede) {
      return {
        tipo: 'finalizar',
        respuesta: { texto: 'Ya no tienes permiso de carga en ese equipo, así que no creé nada.' },
      };
    }

    const competencia = leerTexto(ctx.datos, CLAVE_COMPETENCIA);
    const fecha = leerTexto(ctx.datos, CLAVE_FECHA, hoyLocal());
    const equipoNombre = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo');

    const partido = await this.partidos.crear({
      equipoId,
      rival: leerTexto(ctx.datos, CLAVE_RIVAL),
      fecha,
      competencia: competencia || null,
      formato,
      creadoPor: ctx.usuarioId ?? '',
    });

    const detalle = [
      `${equipoNombre} vs ${partido.rival}`,
      competencia || null,
      describirFecha(fecha),
    ]
      .filter(Boolean)
      .join(' — ');

    return {
      tipo: 'finalizar',
      respuesta: {
        texto: [
          'Partido creado ✅',
          detalle,
          `Formato: ${describirFormato(formato)}`,
          '',
          'Cuando arranque, usa /cargar.',
        ].join('\n'),
      },
    };
  }
}

function leerListaTexto(datos: DatosFlujo, clave: string): string[] {
  const valor = datos[clave];

  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}
