import { botonComando } from '../conversacion/comandos';
import type { Boton, RespuestaBot } from '../channels/channel.types';

/**
 * Frases y botones que se repetían casi textuales en varios dominios.
 *
 * Antes de este catálogo, corregir "no tienes permiso" en un archivo dejaba
 * las otras variantes desincronizadas sin que nadie lo notara — es
 * exactamente el problema que centralizarlas resuelve.
 */
export const textos = {
  primeroUsaStart: () => '👋 Primero usa /start.',

  botonEmpezar: (): Boton => botonComando('start', 'Empezar'),
  botonAyuda: (): Boton => botonComando('ayuda', 'Ver qué puedo hacer'),

  /** `/equipos`, `/partidos`, `/stats`, `/tabla`: mismo aviso, mismo botón. */
  sinEquipos: (): RespuestaBot => ({
    texto: 'Todavía no perteneces a ningún equipo.',
    botones: [botonComando('start', 'Empezar')],
  }),

  /** "No encontré el partido.", "No encontré a ese jugador." */
  noEncontre: (cosa: string, sugerencia?: string) =>
    sugerencia ? `🔍 No encontré ${cosa}. ${sugerencia}` : `🔍 No encontré ${cosa}.`,

  /**
   * El rol se revalida justo antes de escribir, en todo el bot: la sesión
   * dura una hora y el teclado sigue ahí, así que a alguien al que le
   * revocaron el permiso a mitad de camino no le tiene que seguir
   * funcionando.
   */
  permisoRevocado: (consecuencia: string) =>
    `🔒 Ya no tienes permiso para eso, así que ${consecuencia}.`,
  soloAdmin: (que: string) => `🔒 Solo un admin puede ${que}.`,
  sinPermisoPara: (que: string) => `🔒 No tienes permiso para ${que}.`,

  formatoNoEntendido: () => 'No lo entendí. Escríbelo así: 3 x 20',
  necesitoElCodigo: () => 'Necesito el código. Se ve así: YAKO-X7F2A',

  preguntaFormatoCustom: (limites: {
    tiemposMin: number;
    tiemposMax: number;
    minutosMin: number;
    minutosMax: number;
  }) =>
    `Escribe "tiempos x minutos", por ejemplo: 3 x 20\n\n(${limites.tiemposMin}-${limites.tiemposMax} tiempos, ${limites.minutosMin}-${limites.minutosMax} minutos)`,
};
