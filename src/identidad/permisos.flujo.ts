import { Injectable } from '@nestjs/common';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import {
  botonesPaginados,
  ID_VER_MAS,
  paginaSiguiente,
} from '../conversacion/pasos-comunes/paginacion';
import { MembresiasService } from './membresias.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/permisos';
import { ETIQUETA_ROL_CORTA, ROLES, type Rol } from './roles';

export const FLUJO_PERMISOS = 'permisos';

const PASOS = { equipo: 'equipo', miembro: 'miembro', rol: 'rol' } as const;

const CLAVE_MIEMBRO_ID = 'miembroId';
const CLAVE_MIEMBRO_NOMBRE = 'miembroNombre';

const PREFIJO_MIEMBRO = 'pm:u:';
const PREFIJO_ROL = 'pm:r:';
const CLAVE_PAGINA = 'paginaMiembros';

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
          pregunta: textos.preguntaEquipo,
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
                texto: textos.soloElUsuario(leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE)),
              },
            },
          };
        }

        const { botones } = botonesPaginados(
          otros.map((m) => ({
            id: `${PREFIJO_MIEMBRO}${m.usuarioId}`,
            texto: `${m.nombre} (${ETIQUETA_ROL_CORTA[m.rol]})`,
          })),
          leerNumero(ctx.datos, CLAVE_PAGINA),
        );

        return { respuesta: { texto: textos.preguntaMiembro(), botones } };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (seleccion === ID_VER_MAS) {
          const miembros = await this.membresias.miembrosDe(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
          const otros = miembros.filter((m) => m.usuarioId !== ctx.usuarioId);

          return {
            tipo: 'ir',
            pasoId: PASOS.miembro,
            datos: {
              [CLAVE_PAGINA]: paginaSiguiente(leerNumero(ctx.datos, CLAVE_PAGINA), otros.length),
            },
          };
        }

        if (!seleccion.startsWith(PREFIJO_MIEMBRO)) {
          return { tipo: 'finalizar', respuesta: { texto: textos.noCambieNada() } };
        }

        const miembroId = seleccion.slice(PREFIJO_MIEMBRO.length);
        const miembros = await this.membresias.miembrosDe(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const miembro = miembros.find((m) => m.usuarioId === miembroId);

        if (!miembro) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textos.yaNoEstaEnElEquipo() },
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
            texto: textos.preguntaRol(leerTexto(ctx.datos, CLAVE_MIEMBRO_NOMBRE)),
            botones: ROLES.map((rol) => ({
              id: `${PREFIJO_ROL}${rol}`,
              texto: ETIQUETA_ROL_CORTA[rol],
            })),
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (!seleccion.startsWith(PREFIJO_ROL)) {
          return { tipo: 'finalizar', respuesta: { texto: textos.noCambieNada() } };
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
            respuesta: { texto: textosComunes.soloAdmin('cambiar permisos') },
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
                texto: textos.unicoAdmin(nombre, leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE)),
              },
            };
          }
        }

        await this.membresias.asignarRol(miembroId, equipoId, nuevoRol);

        return {
          tipo: 'finalizar',
          respuesta: {
            texto: textos.rolCambiado(
              nombre,
              ETIQUETA_ROL_CORTA[nuevoRol],
              leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE),
            ),
          },
        };
      },
    };
  }
}
