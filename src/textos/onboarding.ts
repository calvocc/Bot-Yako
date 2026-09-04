/** Textos de `/start` (creación de academia + primer equipo, o canje de código). */
export const textos = {
  cierre: () =>
    'Ya puedes crear otro equipo con /nuevoequipo, invitar a los papás con /invitar, o ver tus equipos con /equipos.',

  holaDeNuevo: (lista: string, cierre: string) =>
    `¡Hola de nuevo! Ya estás en:\n\n${lista}\n\n${cierre}`,

  bienvenida: () =>
    '¡Hola! Soy Yako ⚽, llevo las estadísticas de tu academia.\n\nPara empezar, dime:',
  botonTengoInvitacion: '🔑 Tengo invitación',
  botonCrearAcademia: '🏫 Crear academia',
  eligeUnaOpcion: () => 'Elige una de las dos opciones:',

  pedirCodigo: () => 'Pega el código de invitación que te compartieron.',
  pedirCodigoConError: (error: string) => `${error}\n\nPega el código aquí:`,

  preguntaNombreAcademia: () =>
    'Perfecto, vas a ser el administrador.\n\n¿Cómo se llama la academia u organización?',
  nombreAcademiaCorto: () => 'Necesito un nombre de al menos 2 letras. ¿Cómo se llama?',

  academiaCreada: (nombreAcademia: string) =>
    `Academia "${nombreAcademia}" creada ✅\n\nAhora el primer equipo o categoría. ¿Cómo se llama? (por ejemplo: Sub-11)`,
  nombreEquipoRepetido: (nombreRepetido: string) =>
    `Ya tienes un equipo llamado "${nombreRepetido}". Elige otro nombre:`,
  preguntaNombreEquipo: () => '¿Cómo se llama el equipo? (por ejemplo: Sub-11)',

  preguntaFormato: (equipoNombre: string) => `¿Formato de partido para ${equipoNombre}?`,
  botonFormatoOtro: 'Otro',
};
