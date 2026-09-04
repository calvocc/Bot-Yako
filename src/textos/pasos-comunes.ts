/**
 * Textos de los pasos de flujo reutilizables (`conversacion/pasos-comunes/`).
 *
 * Se usan desde varios dominios a la vez, así que viven aparte de
 * `comunes.ts` —que son duplicados encontrados entre dominios— en vez de dentro
 * de uno solo.
 */
export const textos = {
  verMas: 'Ver más',

  eligeAlMenos: (minimo: number) =>
    minimo === 1 ? 'Elige al menos uno.' : `Elige al menos ${minimo}.`,
  confirmarListo: 'Listo',
  marcaSeleccionado: (texto: string) => `✅ ${texto}`,
  todos: '✅ Todos',
  ninguno: 'Ninguno',
  textoNoReconocido: 'No reconocí nada de eso. Toca uno de los botones.',

  selectorEquipo: {
    pregunta: '¿Con cuál equipo?',
    sinEquipos:
      'Todavía no perteneces a ningún equipo. Usa /start para crear tu academia o entrar con un código.',
    sinEquiposAdmin:
      '🔒 Esto solo lo puede hacer un administrador, y no eres admin de ningún equipo.',
    sinEquiposEditor:
      '🔒 No tienes permiso para cargar en ningún equipo. Pídele al admin que te dé rol de Editor.',
    noReconocido: 'No reconocí ese equipo. Toca uno de los botones:',
  },
};
