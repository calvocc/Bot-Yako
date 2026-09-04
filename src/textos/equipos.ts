/** Textos de `/nuevoequipo` y `/equipos`. */
export const textos = {
  soloAdmins: () =>
    '🔒 Crear equipos es cosa de administradores, y no eres admin de ninguna academia.',
  preguntaAcademia: () => '¿En cuál academia?',
  tocaUnaAcademia: () => 'Toca una de las academias:',

  nombreRepetido: (nombre: string) => `Ya existe un equipo llamado "${nombre}". Elige otro nombre:`,
  preguntaNombre: () => '¿Cómo se llama el equipo nuevo? (por ejemplo: Sub-9)',
  necesitoNombre: () => 'Necesito un nombre para el equipo.',

  preguntaFormato: () => '¿Formato de partido para esta categoría?',
  botonFormatoOtro: 'Otro',

  yaNoEsAdmin: () => '🔒 Ya no eres admin de esta academia, así que no creé el equipo.',

  listado: (lineas: string) => `Tus equipos:\n\n${lineas}`,
};
