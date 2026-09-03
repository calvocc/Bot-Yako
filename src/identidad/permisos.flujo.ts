import { Injectable } from '@nestjs/common';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import { MembresiasService } from './membresias.service';
import { ETIQUETA_ROL_CORTA, ROLES, type Rol } from './roles';

export const FLUJO_PERMISOS = 'permisos';

const PASOS = { equipo: 'equipo', miembro: 'miembro', rol: 'rol' } as const;

const CLAVE_MIEMBRO_ID = 'miembroId';
const CLAVE_MIEMBRO_NOMBRE = 'miembroNombre';

const PREFIJO_MIEMBRO = 'pm:u:';
const PREFIJO_ROL = 'pm:r:';

@Injectable()
export class PermisosFlujo {
  constructor(private readonly membresias: MembresiasService) {}

  construir(): Flujo {
    return {
      id: FLUJO_PERMISOS,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.miembro,
          rolMinimo: 'admin',
          pregunta: '¿En cuál equipo quieres cambiar permisos?',
        }),
        this.pasoMiembro(),
        this.pasoRol(),
      ],
    };
  }

  private pasoMiembro(): Paso {
    return {
      id: PASOS.miembro,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const miembros = await this.membresias.miembrosDe(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const otros = miembros.filter((m) => m.usuarioId !== ctx.usuarioId);

        if (otros.length === 0) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: {
                texto: `En ${leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE)} todavía no hay nadie más. Invita con /invitar.`,
              },
            },
          };
        }

        return {
          respuesta: {
            texto: '¿A quién le cambias el rol?',
            botones: otros.slice(0, 9).map((m) => ({
              id: `${PREFIJO_MIEMBRO}${m.usuarioId}`,
              texto: `${m.nombre} (${ETIQUETA_ROL_CORTA[m.rol]})`.slice(0, 20),
            })),
          },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (!seleccion.startsWith(PREFIJO_MIEMBRO)) {
          return { tipo: 'finalizar', respuesta: { texto: 'No cambié ningún permiso.' } };
        }

        const miembroId = seleccion.slice(PREFIJO_MIEMBRO.length);
        const miembros = await this.membresias.miembrosDe(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const miembro = miembros.find((m) => m.usuarioId === miembroId);

        if (!miembro) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: 'Esa persona ya no está en el equipo.' },
          };
        }

        return {
          tipo: 'ir',
          pasoId: PASOS.rol,
          datos: { [CLAVE_MIEMBRO_ID]: miembroId, [CLAVE_MIEMBRO_NOMBRE]: miembro.nombre },
        };
      },
    };
  }

  private pasoRol(): Paso {
    return {
      id: PASOS.rol,

      entrar: (ctx: ContextoFlujo) =>
        Promise.resolve({
          respuesta: {
            texto: `¿Qué rol le doy a ${leerTexto(ctx.datos, CLAVE_MIEMBRO_NOMBRE)}?`,
            botones: ROLES.map((rol) => ({
              id: `${PREFIJO_ROL}${rol}`,
              texto: ETIQUETA_ROL_CORTA[rol],
            })),
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (!seleccion.startsWith(PREFIJO_ROL)) {
          return { tipo: 'finalizar', respuesta: { texto: 'No cambié ningún permiso.' } };
        }

        const nuevoRol = seleccion.slice(PREFIJO_ROL.length) as Rol;
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const miembroId = leerTexto(ctx.datos, CLAVE_MIEMBRO_ID);
        const nombre = leerTexto(ctx.datos, CLAVE_MIEMBRO_NOMBRE);

        const sigueSiendoAdmin = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'admin')
          : false;

        if (!sigueSiendoAdmin) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: 'Solo un admin puede cambiar permisos.' },
          };
        }

        const rolActual = await this.membresias.rolEn(miembroId, equipoId);

        // Degradar al último admin dejaría el equipo sin quien lo administre:
        // nadie podría invitar, cambiar roles ni reabrir partidos.
        if (rolActual === 'admin' && nuevoRol !== 'admin') {
          const hayOtro = await this.membresias.hayOtroAdmin(equipoId, miembroId);

          if (!hayOtro) {
            return {
              tipo: 'finalizar',
              respuesta: {
                texto: `${nombre} es el único admin de ${leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE)}. Nombra a otro admin antes de bajarle el rol.`,
              },
            };
          }
        }

        await this.membresias.asignarRol(miembroId, equipoId, nuevoRol);

        return {
          tipo: 'finalizar',
          respuesta: {
            texto: `Listo: ${nombre} ahora es ${ETIQUETA_ROL_CORTA[nuevoRol]} en ${leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE)} ✅`,
          },
        };
      },
    };
  }
}
