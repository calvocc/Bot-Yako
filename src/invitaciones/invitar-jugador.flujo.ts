import { Injectable } from '@nestjs/common';
import { TypedConfigService } from '../config/config.service';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import {
  botonesPaginados,
  ID_VER_MAS,
  paginaSiguiente,
} from '../conversacion/pasos-comunes/paginacion';
import { CLAVE_EQUIPO_ID, pasoSelectorEquipo } from '../conversacion/pasos-comunes/selector-equipo';
import { MembresiasService } from '../identidad/membresias.service';
import { describirJugador, JugadoresService } from '../jugadores/jugadores.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/invitaciones';
import { deepLinkDe, InvitacionesService, VIGENCIA_DIAS_DEFECTO } from './invitaciones.service';

export const FLUJO_INVITAR_JUGADOR = 'invitar-jugador';

const PASOS = { equipo: 'equipo', jugador: 'jugador' } as const;

const PREFIJO_JUGADOR = 'invj:';
const CLAVE_PAGINA = 'paginaInvitarJugador';

/**
 * `/invitarjugador`: código para vincular a un papá/tutor con un jugador
 * puntual (Frente B), en vez de darlo de alta en el equipo entero como hace
 * `/invitar`. Mismo patrón — selecciona equipo, genera código — con un paso
 * extra para elegir a cuál jugador de la plantilla.
 */
@Injectable()
export class InvitarJugadorFlujo {
  constructor(
    private readonly invitaciones: InvitacionesService,
    private readonly membresias: MembresiasService,
    private readonly jugadores: JugadoresService,
    private readonly config: TypedConfigService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_INVITAR_JUGADOR,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.jugador,
          // Quien edita la plantilla es quien puede invitar papás a ella —
          // mismo umbral que /plantilla, no admin puro como /invitar.
          rolMinimo: 'editor',
          pregunta: textos.invitarJugador.preguntaEquipo,
        }),
        this.pasoJugador(),
      ],
    };
  }

  private pasoJugador(): Paso {
    return {
      id: PASOS.jugador,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const lista = await this.jugadores.listar(equipoId);

        if (lista.length === 0) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: { texto: textos.invitarJugador.sinJugadores() },
            },
          };
        }

        const pagina = leerNumero(ctx.datos, CLAVE_PAGINA);
        const { botones } = botonesPaginados(
          lista.map((j) => ({ id: `${PREFIJO_JUGADOR}${j.id}`, texto: describirJugador(j) })),
          pagina,
        );

        return { respuesta: { texto: textos.invitarJugador.preguntaJugador, botones } };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (seleccion === ID_VER_MAS) {
          const lista = await this.jugadores.listar(equipoId);

          return {
            tipo: 'ir',
            pasoId: PASOS.jugador,
            datos: {
              [CLAVE_PAGINA]: paginaSiguiente(leerNumero(ctx.datos, CLAVE_PAGINA), lista.length),
            },
          };
        }

        if (!seleccion.startsWith(PREFIJO_JUGADOR)) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textosComunes.noEncontre('a ese jugador') },
          };
        }

        // El permiso se revalida al generar: entre elegir el equipo y tocar
        // el jugador el rol pudo cambiar.
        const puedeEditar = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
          : false;

        if (!puedeEditar) {
          return {
            tipo: 'finalizar',
            respuesta: {
              texto: textosComunes.sinPermisoPara(
                'generar invitaciones de jugador para este equipo',
              ),
            },
          };
        }

        const jugadorId = seleccion.slice(PREFIJO_JUGADOR.length);
        const invitacion = await this.invitaciones.crearParaJugador(jugadorId, ctx.usuarioId ?? '');

        return { tipo: 'finalizar', respuesta: { texto: this.mensaje(invitacion) } };
      },
    };
  }

  private mensaje(invitacion: {
    codigo: string;
    jugadorNombre: string;
    equipoNombre: string;
    usosMaximos: number;
  }): string {
    const usuarioBot = this.config.get('TELEGRAM_BOT_USERNAME');

    return textos.invitarJugador.codigoGenerado({
      jugador: invitacion.jugadorNombre,
      equipo: invitacion.equipoNombre,
      dias: VIGENCIA_DIAS_DEFECTO,
      etiquetaUsos:
        invitacion.usosMaximos === 1 ? '1 uso' : `hasta ${invitacion.usosMaximos} personas`,
      codigo: invitacion.codigo,
      enlace: usuarioBot ? deepLinkDe(invitacion.codigo, usuarioBot) : undefined,
    });
  }
}
