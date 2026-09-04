import { Injectable } from '@nestjs/common';
import { TypedConfigService } from '../config/config.service';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import { MembresiasService } from '../identidad/membresias.service';
import { ETIQUETA_ROL, type Rol } from '../identidad/roles';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/invitaciones';
import { deepLinkDe, InvitacionesService, VIGENCIA_DIAS_DEFECTO } from './invitaciones.service';

export const FLUJO_INVITAR = 'invitar';

const PASOS = { equipo: 'equipo', rol: 'rol', usos: 'usos' } as const;

const CLAVE_ROL = 'rolInvitacion';
const PREFIJO_ROL = 'inv:rol:';
const PREFIJO_USOS = 'inv:usos:';

/** Un código para una persona, o uno para mandar al grupo entero. */
const OPCIONES_USOS = [
  { usos: 1, etiqueta: textos.invitar.botonUnaPersona },
  { usos: 25, etiqueta: textos.invitar.botonTodoElGrupo },
] as const;

@Injectable()
export class InvitarFlujo {
  constructor(
    private readonly invitaciones: InvitacionesService,
    private readonly membresias: MembresiasService,
    private readonly config: TypedConfigService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_INVITAR,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.rol,
          rolMinimo: 'admin',
          pregunta: textos.invitar.preguntaEquipo,
        }),
        this.pasoRol(),
        this.pasoUsos(),
      ],
    };
  }

  private pasoRol(): Paso {
    return {
      id: PASOS.rol,

      entrar: () =>
        Promise.resolve({
          respuesta: {
            texto: textos.invitar.preguntaRol,
            botones: [
              { id: `${PREFIJO_ROL}viewer`, texto: textos.invitar.botonSoloConsultar },
              { id: `${PREFIJO_ROL}editor`, texto: textos.invitar.botonCargarEventos },
            ],
          },
        }),

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (!seleccion.startsWith(PREFIJO_ROL)) {
          return Promise.resolve({
            tipo: 'repetir',
            respuesta: {
              texto: textos.invitar.repetirRol,
              botones: [
                { id: `${PREFIJO_ROL}viewer`, texto: textos.invitar.botonSoloConsultar },
                { id: `${PREFIJO_ROL}editor`, texto: textos.invitar.botonCargarEventos },
              ],
            },
          });
        }

        // Solo viewer y editor: repartir admin por un código pegado en un grupo
        // de WhatsApp es entregar el control de la academia a quien lo reenvíe.
        const rol = seleccion.slice(PREFIJO_ROL.length) as Rol;
        const permitido: Rol = rol === 'editor' ? 'editor' : 'viewer';

        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.usos,
          datos: { [CLAVE_ROL]: permitido },
        });
      },
    };
  }

  private pasoUsos(): Paso {
    return {
      id: PASOS.usos,

      entrar: (): Promise<Entrada> =>
        Promise.resolve({
          respuesta: {
            texto: textos.invitar.preguntaUsos,
            botones: OPCIONES_USOS.map((o) => ({
              id: `${PREFIJO_USOS}${o.usos}`,
              texto: o.etiqueta,
            })),
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';
        const usos = seleccion.startsWith(PREFIJO_USOS)
          ? Number(seleccion.slice(PREFIJO_USOS.length))
          : 1;

        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const rol = ctx.datos[CLAVE_ROL] as Rol;

        // El permiso se revalida al generar: entre la selección y el toque
        // final el rol pudo cambiar.
        const esAdmin = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'admin')
          : false;

        if (!esAdmin) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textosComunes.soloAdmin('generar invitaciones para este equipo') },
          };
        }

        const invitacion = await this.invitaciones.crear(equipoId, rol, ctx.usuarioId ?? '', {
          usosMaximos: usos,
        });

        return { tipo: 'finalizar', respuesta: { texto: this.mensaje(invitacion, ctx) } };
      },
    };
  }

  private mensaje(invitacion: { codigo: string; usosMaximos: number }, ctx: ContextoFlujo): string {
    const equipo = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE);
    const rol = ctx.datos[CLAVE_ROL] as Rol;
    const usuarioBot = this.config.get('TELEGRAM_BOT_USERNAME');

    return textos.invitar.codigoGenerado({
      equipo,
      rol: ETIQUETA_ROL[rol],
      dias: VIGENCIA_DIAS_DEFECTO,
      etiquetaUsos:
        invitacion.usosMaximos === 1 ? '1 uso' : `hasta ${invitacion.usosMaximos} personas`,
      codigo: invitacion.codigo,
      enlace: usuarioBot ? deepLinkDe(invitacion.codigo, usuarioBot) : undefined,
    });
  }
}
