import type { DefinicionComando } from '../conversacion/comandos';

/** Textos del router (`/cancelar`, comando desconocido, botón caduco) y de `/ayuda`. */
export const textos = {
  canceladoConFlujo: () =>
    'Listo, cancelé lo que estábamos haciendo. Escribe /ayuda si quieres ver las opciones.',
  canceladoSinFlujo: () => 'No había nada en curso. Escribe /ayuda si quieres ver las opciones.',
  comandoDesconocido: (nombre: string) => `🤔 No conozco el comando /${nombre}.`,
  botonViejo: () => '🤔 Ese botón ya no está disponible; seguramente es de un mensaje anterior.',
  sinContexto: () => '🤔 No estoy seguro de qué necesitas.',

  ayuda: {
    intro: () => 'Soy Yako ⚽, llevo las estadísticas de tu academia.',
    cierre: () => 'Si te pierdes en algún paso, escribe /cancelar.',
    // Validado contra el union real de `rolMinimo` sin perder el tipo
    // literal: un quinto rol nuevo o un renombre de `viewer` en comandos.ts
    // ahora falla en compilación en vez de imprimir "undefined" en /ayuda.
    etiquetaRol: {
      cualquiera: '',
      viewer: '',
      editor: ' · Editor',
      admin: ' · Admin',
    } satisfies Record<DefinicionComando['rolMinimo'], string>,
  },
};
