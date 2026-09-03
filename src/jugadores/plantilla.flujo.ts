import { Injectable } from '@nestjs/common';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import { MembresiasService } from '../identidad/membresias.service';
import { CLAVE_ALTAS, pasoCargarPlantilla } from './pasos-plantilla';
import { describirJugador, JugadoresService } from './jugadores.service';

export const FLUJO_PLANTILLA = 'plantilla';

const PASOS = {
  equipo: 'equipo',
  ver: 'ver',
  agregar: 'agregar',
  bajaElegir: 'baja-elegir',
} as const;

const OPCION_AGREGAR = 'pl:agregar';
const OPCION_BAJA = 'pl:baja';
const OPCION_CERRAR = 'pl:cerrar';
const PREFIJO_BAJA = 'pl:b:';

@Injectable()
export class PlantillaFlujo {
  constructor(
    private readonly jugadores: JugadoresService,
    private readonly membresias: MembresiasService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_PLANTILLA,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.ver,
          pregunta: '¿De cuál equipo quieres ver la plantilla?',
        }),
        this.pasoVer(),
        pasoCargarPlantilla(PASOS.agregar, this.jugadores, {
          claveEquipoId: CLAVE_EQUIPO_ID,
          alTerminar: (_ctx, cargados) => ({
            tipo: 'finalizar',
            respuesta: {
              texto:
                cargados === 0
                  ? 'No agregué a nadie.'
                  : `Listo, agregué ${cargados} jugador${cargados === 1 ? '' : 'es'}. ✅`,
            },
          }),
        }),
        this.pasoBajaElegir(),
      ],
    };
  }

  /** Muestra la plantilla; las acciones de edición solo si el rol alcanza. */
  private pasoVer(): Paso {
    return {
      id: PASOS.ver,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const lista = await this.jugadores.listar(equipoId);
        const puedeEditar = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
          : false;

        const cuerpo =
          lista.length === 0
            ? 'Esta plantilla está vacía.'
            : lista.map((j) => `• ${describirJugador(j)}`).join('\n');

        return {
          respuesta: {
            texto: `Plantilla de ${leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE)} (${lista.length}):\n\n${cuerpo}`,
            botones: puedeEditar
              ? [
                  { id: OPCION_AGREGAR, texto: 'Agregar' },
                  ...(lista.length > 0 ? [{ id: OPCION_BAJA, texto: 'Dar de baja' }] : []),
                  { id: OPCION_CERRAR, texto: 'Listo' },
                ]
              : undefined,
          },
        };
      },

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;

        if (seleccion === OPCION_AGREGAR) {
          return Promise.resolve({
            tipo: 'ir',
            pasoId: PASOS.agregar,
            datos: { [CLAVE_ALTAS]: 0 },
          });
        }

        if (seleccion === OPCION_BAJA) {
          return Promise.resolve({ tipo: 'ir', pasoId: PASOS.bajaElegir });
        }

        return Promise.resolve({ tipo: 'finalizar' });
      },
    };
  }

  private pasoBajaElegir(): Paso {
    return {
      id: PASOS.bajaElegir,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const lista = await this.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));

        return {
          respuesta: {
            texto: '¿A quién das de baja? Sus estadísticas de partidos ya jugados se conservan.',
            botones: lista.slice(0, 9).map((j) => ({
              id: `${PREFIJO_BAJA}${j.id}`,
              texto: describirJugador(j).slice(0, 20),
            })),
          },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (!seleccion.startsWith(PREFIJO_BAJA)) {
          return { tipo: 'finalizar', respuesta: { texto: 'No di de baja a nadie.' } };
        }

        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const jugadorId = seleccion.slice(PREFIJO_BAJA.length);

        // Se relee el permiso en el momento de escribir: el rol pudo cambiar
        // entre que se mostró el botón y se pulsó.
        const puede = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
          : false;

        if (!puede) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: 'No tienes permiso para editar la plantilla.' },
          };
        }

        const listo = await this.jugadores.desactivar(equipoId, jugadorId);

        return {
          tipo: 'finalizar',
          respuesta: { texto: listo ? 'Jugador dado de baja ✅' : 'No encontré a ese jugador.' },
        };
      },
    };
  }
}
