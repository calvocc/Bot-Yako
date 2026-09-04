import { Injectable } from '@nestjs/common';
import {
  botonesPaginados,
  ID_VER_MAS,
  paginaSiguiente,
} from '../conversacion/pasos-comunes/paginacion';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import { type Competencia, CompetenciasService } from '../competencias/competencias.service';
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
const CLAVE_COMPETENCIA_ID = 'competenciaId';
const CLAVE_COMPETENCIA_NOMBRE = 'competenciaNombre';
const CLAVE_PAGINA_COMPETENCIA = 'paginaCompetencia';
const CLAVE_TIEMPOS = 'cantidadTiempos';
const CLAVE_MINUTOS = 'minutosPorTiempo';

const PREFIJO_FECHA = 'fe:';
const PREFIJO_COMPETENCIA = 'co:';
const ID_COMPETENCIA_OTRA = 'co:otra';
const ID_COMPETENCIA_NINGUNA = 'co:ninguna';
const ID_FORMATO_HABITUAL = 'fmt:habitual';
const ID_FORMATO_OTRO = 'fmt:otro';

/** "Nueva competencia" y "Sin competencia": botones fijos que se suman a la lista paginada. */
const RESERVA_BOTONES_COMPETENCIA = 2;

@Injectable()
export class NuevoPartidoFlujo {
  constructor(
    private readonly partidos: PartidosService,
    private readonly equipos: EquiposService,
    private readonly competencias: CompetenciasService,
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
   * Ya no hay un listado por defecto (Liga/Torneo/Amistoso): mostrarlo llevaba
   * a que cada papá escribiera su propia variante de un torneo que el equipo
   * ya había cargado antes, y las estadísticas terminaban repartidas entre
   * "DBS" y "Torneo DBS". Se ofrece solo lo que la academia ya jugó —una
   * competencia es de la academia, no del equipo, porque dos categorías
   * pueden compartir el mismo torneo— más la opción de crear una nueva.
   *
   * Los botones llevan el id real de la competencia, no un índice posicional:
   * a diferencia del esquema anterior, no hay ventana de carrera que corra la
   * lista entre la pregunta y la respuesta.
   */
  private pasoCompetencia(): Paso {
    const listar = async (ctx: ContextoFlujo): Promise<Competencia[]> => {
      const equipo = await this.equipos.obtener(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));

      return equipo ? this.competencias.deLaAcademia(equipo.academiaId) : [];
    };

    const botones = (lista: Competencia[], pagina: number) => {
      const { botones: paginados } = botonesPaginados(
        lista.map((c) => ({ id: `${PREFIJO_COMPETENCIA}${c.id}`, texto: c.nombre })),
        pagina,
        RESERVA_BOTONES_COMPETENCIA,
      );

      return [
        ...paginados,
        { id: ID_COMPETENCIA_OTRA, texto: 'Nueva competencia' },
        { id: ID_COMPETENCIA_NINGUNA, texto: 'Sin competencia' },
      ];
    };

    return {
      id: PASOS.competencia,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const lista = await listar(ctx);

        return { respuesta: { texto: '¿En qué competencia?', botones: botones(lista, 0) } };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;

        if (seleccion === ID_COMPETENCIA_OTRA) {
          return { tipo: 'ir', pasoId: PASOS.competenciaLibre };
        }

        if (seleccion === ID_COMPETENCIA_NINGUNA) {
          return {
            tipo: 'ir',
            pasoId: PASOS.formato,
            datos: { [CLAVE_COMPETENCIA_ID]: null, [CLAVE_COMPETENCIA_NOMBRE]: '' },
          };
        }

        const lista = await listar(ctx);
        const pagina = leerNumero(ctx.datos, CLAVE_PAGINA_COMPETENCIA, 0);

        if (seleccion === ID_VER_MAS) {
          const siguiente = paginaSiguiente(pagina, lista.length, RESERVA_BOTONES_COMPETENCIA);

          return {
            tipo: 'repetir',
            respuesta: { texto: '¿En qué competencia?', botones: botones(lista, siguiente) },
            datos: { [CLAVE_PAGINA_COMPETENCIA]: siguiente },
          };
        }

        if (seleccion?.startsWith(PREFIJO_COMPETENCIA)) {
          const elegida = lista.find((c) => c.id === seleccion.slice(PREFIJO_COMPETENCIA.length));

          if (elegida) {
            return {
              tipo: 'ir',
              pasoId: PASOS.formato,
              datos: {
                [CLAVE_COMPETENCIA_ID]: elegida.id,
                [CLAVE_COMPETENCIA_NOMBRE]: elegida.nombre,
              },
            };
          }
        } else {
          // Escribir el nombre también sirve, igual que en el resto del bot:
          // si coincide con una que ya existe la reusa, si no la crea.
          const escrito = ctx.mensaje.texto?.trim();

          if (escrito) return this.elegirCompetencia(ctx, escrito);
        }

        return {
          tipo: 'repetir',
          respuesta: {
            texto: 'Toca una opción o escribe el nombre:',
            botones: botones(lista, pagina),
          },
          datos: { [CLAVE_PAGINA_COMPETENCIA]: pagina },
        };
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

        return this.elegirCompetencia(ctx, nombre);
      },
    };
  }

  /** Busca o crea la competencia por nombre, y avanza con ella elegida. */
  private async elegirCompetencia(ctx: ContextoFlujo, nombre: string): Promise<Transicion> {
    const equipo = await this.equipos.obtener(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));

    if (!equipo) {
      return {
        tipo: 'finalizar',
        respuesta: { texto: 'No encontré el equipo. Vuelve a empezar.' },
      };
    }

    const competencia = await this.competencias.obtenerOCrear(
      equipo.academiaId,
      nombre,
      ctx.usuarioId ?? '',
    );

    return {
      tipo: 'ir',
      pasoId: PASOS.formato,
      datos: {
        [CLAVE_COMPETENCIA_ID]: competencia.id,
        [CLAVE_COMPETENCIA_NOMBRE]: competencia.nombre,
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

    // `null` significa "Sin competencia", elegida a propósito; sin tocar el
    // paso aún no debería poder llegar acá, pero por si acaso se lee con cuidado.
    const competenciaIdRaw = ctx.datos[CLAVE_COMPETENCIA_ID];
    const competenciaId = typeof competenciaIdRaw === 'string' ? competenciaIdRaw : null;
    const competenciaNombre = leerTexto(ctx.datos, CLAVE_COMPETENCIA_NOMBRE);
    const fecha = leerTexto(ctx.datos, CLAVE_FECHA, hoyLocal());
    const equipoNombre = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo');

    const partido = await this.partidos.crear({
      equipoId,
      rival: leerTexto(ctx.datos, CLAVE_RIVAL),
      fecha,
      competenciaId,
      formato,
      creadoPor: ctx.usuarioId ?? '',
    });

    const detalle = [
      `${equipoNombre} vs ${partido.rival}`,
      competenciaNombre || null,
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
