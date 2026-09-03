import { Injectable } from '@nestjs/common';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import { MembresiasService } from '../identidad/membresias.service';
import { JugadoresService } from '../jugadores/jugadores.service';
import {
  CLAVE_ALTAS,
  pasoCargarPlantilla,
  respuestaPlantillaLista,
} from '../jugadores/pasos-plantilla';
import {
  EquiposService,
  FORMATOS_SUGERIDOS,
  LIMITES_FORMATO,
  NombreDeEquipoRepetidoError,
  parsearFormato,
} from './equipos.service';

export const FLUJO_NUEVO_EQUIPO = 'nuevo-equipo';

const PASOS = {
  academia: 'academia',
  nombre: 'nombre',
  formato: 'formato',
  formatoCustom: 'formato-custom',
  plantilla: 'plantilla',
} as const;

const CLAVE_ACADEMIA_ID = 'academiaId';
const CLAVE_NOMBRE = 'nombreEquipo';
const CLAVE_EQUIPO_ID = 'equipoId';
const CLAVE_REPETIDO = 'nombreRepetido';

const PREFIJO_ACADEMIA = 'ac:';
const PREFIJO_FORMATO = 'fmt:';
const OPCION_OTRO = 'fmt:otro';

@Injectable()
export class NuevoEquipoFlujo {
  constructor(
    private readonly equipos: EquiposService,
    private readonly jugadores: JugadoresService,
    private readonly membresias: MembresiasService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_NUEVO_EQUIPO,
      pasoInicial: PASOS.academia,
      pasos: [
        this.pasoAcademia(),
        this.pasoNombre(),
        this.pasoFormato(),
        this.pasoFormatoCustom(),
        pasoCargarPlantilla(PASOS.plantilla, this.jugadores, {
          claveEquipoId: CLAVE_EQUIPO_ID,
          alTerminar: (ctx, cargados) => ({
            tipo: 'finalizar',
            respuesta: respuestaPlantillaLista(
              cargados,
              `Equipo "${leerTexto(ctx.datos, CLAVE_NOMBRE)}" listo. Invita a los papás con /invitar.`,
            ),
          }),
        }),
      ],
    };
  }

  /**
   * Elige la academia. Como el rol es por equipo, "admin de la academia" se
   * deriva de administrar al menos uno de sus equipos; con una sola academia
   * administrada no se pregunta nada.
   */
  private pasoAcademia(): Paso {
    return {
      id: PASOS.academia,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const administradas = ctx.usuarioId
          ? await this.membresias.academiasQueAdministra(ctx.usuarioId)
          : [];

        if (administradas.length === 0) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: {
                texto:
                  'Crear equipos es cosa de administradores, y no eres admin de ninguna academia.',
              },
            },
          };
        }

        if (administradas.length === 1) {
          return {
            transicion: {
              tipo: 'ir',
              pasoId: PASOS.nombre,
              datos: { [CLAVE_ACADEMIA_ID]: administradas[0].academiaId },
            },
          };
        }

        return {
          respuesta: {
            texto: '¿En cuál academia?',
            botones: administradas.map((a) => ({
              id: `${PREFIJO_ACADEMIA}${a.academiaId}`,
              texto: a.nombre.slice(0, 20),
            })),
          },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const administradas = ctx.usuarioId
          ? await this.membresias.academiasQueAdministra(ctx.usuarioId)
          : [];
        const seleccion = ctx.mensaje.seleccionId ?? '';
        const elegida = administradas.find(
          (a) => `${PREFIJO_ACADEMIA}${a.academiaId}` === seleccion,
        );

        if (!elegida) {
          return {
            tipo: 'repetir',
            respuesta: {
              texto: 'Toca una de las academias:',
              botones: administradas.map((a) => ({
                id: `${PREFIJO_ACADEMIA}${a.academiaId}`,
                texto: a.nombre.slice(0, 20),
              })),
            },
          };
        }

        return {
          tipo: 'ir',
          pasoId: PASOS.nombre,
          datos: { [CLAVE_ACADEMIA_ID]: elegida.academiaId },
        };
      },
    };
  }

  private pasoNombre(): Paso {
    return {
      id: PASOS.nombre,

      entrar: (ctx: ContextoFlujo) => {
        const repetido = ctx.datos[CLAVE_REPETIDO];
        const nombreRepetido = typeof repetido === 'string' ? repetido : '';

        return Promise.resolve({
          respuesta: {
            texto: nombreRepetido
              ? `Ya existe un equipo llamado "${nombreRepetido}". Elige otro nombre:`
              : '¿Cómo se llama el equipo nuevo? (por ejemplo: Sub-9)',
          },
        });
      },

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const nombre = ctx.mensaje.texto?.trim();

        if (!nombre) {
          return Promise.resolve({
            tipo: 'repetir',
            respuesta: { texto: 'Necesito un nombre para el equipo.' },
          });
        }

        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.formato,
          datos: { [CLAVE_NOMBRE]: nombre, [CLAVE_REPETIDO]: '' },
        });
      },
    };
  }

  private pasoFormato(): Paso {
    return {
      id: PASOS.formato,

      entrar: () =>
        Promise.resolve({
          respuesta: {
            texto: '¿Formato de partido para esta categoría?',
            botones: [
              ...FORMATOS_SUGERIDOS.map((f, i) => ({
                id: `${PREFIJO_FORMATO}${i}`,
                texto: f.etiqueta,
              })),
              { id: OPCION_OTRO, texto: 'Otro' },
            ],
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;

        if (seleccion === OPCION_OTRO) return { tipo: 'ir', pasoId: PASOS.formatoCustom };

        const formato = seleccion?.startsWith(PREFIJO_FORMATO)
          ? FORMATOS_SUGERIDOS[Number(seleccion.slice(PREFIJO_FORMATO.length))]
          : parsearFormato(ctx.mensaje.texto ?? '');

        if (!formato) return { tipo: 'ir', pasoId: PASOS.formatoCustom };

        return this.crear(ctx, formato);
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

  private async crear(
    ctx: ContextoFlujo,
    formato: { cantidadTiempos: number; minutosPorTiempo: number },
  ): Promise<Transicion> {
    const nombre = leerTexto(ctx.datos, CLAVE_NOMBRE);

    try {
      const equipo = await this.equipos.crear(
        leerTexto(ctx.datos, CLAVE_ACADEMIA_ID),
        nombre,
        formato,
        ctx.usuarioId ?? '',
      );

      return {
        tipo: 'ir',
        pasoId: PASOS.plantilla,
        datos: { [CLAVE_EQUIPO_ID]: equipo.id, [CLAVE_ALTAS]: 0 },
      };
    } catch (error) {
      if (error instanceof NombreDeEquipoRepetidoError) {
        return { tipo: 'ir', pasoId: PASOS.nombre, datos: { [CLAVE_REPETIDO]: nombre } };
      }

      throw error;
    }
  }
}
