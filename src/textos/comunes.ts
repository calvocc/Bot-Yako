/**
 * Frases que se repetían casi textuales en varios dominios.
 *
 * Antes de este catálogo, corregir "no tienes permiso" en un archivo dejaba
 * las otras variantes desincronizadas sin que nadie lo notara — es
 * exactamente el problema que centralizarlas resuelve.
 *
 * Solo texto, nunca el id de ruteo: un `Boton`/`RespuestaBot` con un `cmd:`
 * adentro ata este catálogo a `conversacion/comandos` y abre la puerta a un
 * ciclo de imports si algún día `conversacion` importa algo de `textos`. El
 * id lo arma cada `.flujo.ts`/handler con `botonComando`, como ya hacía el
 * resto del bot antes de este catálogo.
 */
export const textos = {
  primeroUsaStart: () => '👋 Primero usa /start.',

  botonEmpezar: () => 'Empezar',
  botonAyuda: () => 'Ver qué puedo hacer',

  /** `/equipos`, `/partidos`, `/stats`, `/tabla`: mismo aviso, mismo botón (`botonEmpezar`). */
  sinEquipos: () => 'Todavía no perteneces a ningún equipo.',

  /** "No encontré el partido.", "No encontré a ese jugador." */
  noEncontre: (cosa: string, sugerencia?: string) =>
    sugerencia ? `🔍 No encontré ${cosa}. ${sugerencia}` : `🔍 No encontré ${cosa}.`,

  /**
   * El rol se revalida justo antes de escribir, en todo el bot: la sesión
   * dura una hora y el teclado sigue ahí, así que a alguien al que le
   * revocaron el permiso a mitad de camino no le tiene que seguir
   * funcionando.
   *
   * Pide el rol que hacía falta (no un "permiso" genérico): a alguien que
   * pasó de admin a editor a mitad de flujo no le sirve que le digan "ya no
   * tienes permiso" sin decirle qué rol pedir de vuelta.
   */
  permisoRevocado: (rol: 'admin' | 'editor', consecuencia: string) =>
    `🔒 Ya no eres ${rol} de ese equipo, así que ${consecuencia}.`,
  soloAdmin: (que: string) => `🔒 Solo un administrador puede ${que}.`,
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
