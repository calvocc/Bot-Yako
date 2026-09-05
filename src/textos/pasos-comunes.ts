import { textos as comunes } from './comunes';

/**
 * Textos de los pasos de flujo reutilizables (`conversacion/pasos-comunes/`).
 *
 * Se usan desde varios dominios a la vez, así que viven aparte de
 * `comunes.ts` —que son duplicados encontrados entre dominios— en vez de dentro
 * de uno solo. Donde la frase base ya vive en `comunes.ts`, se compone desde
 * ahí en vez de retipearla: es la misma situación ("no tienes equipo"/"no
 * eres admin"), solo que acá termina el flujo entero en vez de ofrecer un
 * botón, así que la redacción completa sí difiere.
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
  avisoParcial: (sinReconocer: string[]) =>
    `No reconocí: ${sinReconocer.join(', ')}. Los demás sí quedaron marcados.`,

  selectorEquipo: {
    pregunta: '¿Con cuál equipo?',
    sinEquipos: `${comunes.sinEquipos()} Usa /start para crear tu academia o entrar con un código.`,
    sinEquiposAdmin: `${comunes.soloAdmin('hacer esto')} No eres admin de ningún equipo.`,
    sinEquiposEditor: `${comunes.sinPermisoPara('cargar en ningún equipo')} Pídele al admin que te dé rol de Editor.`,
    noReconocido: 'No reconocí ese equipo. Toca uno de los botones:',
  },
};
