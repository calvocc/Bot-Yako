/** Textos de `/nuevopartido`, `/reabrir` y `/partidos`. */
export const textos = {
  nuevoPartido: {
    preguntaEquipo: '¿De qué equipo es el partido?',
    preguntaRival: () => '🆚 Vamos a crear un partido. ¿Contra quién juegan?',
    necesitoRival: () => 'Necesito el nombre del rival.',

    preguntaFecha: () => '¿Qué día se juega? Toca una opción o escribe la fecha (12-10).',
    botonHoy: 'Hoy',
    botonAyer: 'Ayer',
    botonManana: 'Mañana',
    fechaNoEntendida: () => 'No entendí la fecha. Escríbela así: 12-10 (o "hoy").',

    preguntaCompetencia: () => '¿En qué competencia?',
    botonNuevaCompetencia: 'Nueva competencia',
    botonSinCompetencia: 'Sin competencia',
    tocaOpcionOEscribeNombre: () => 'Toca una opción o escribe el nombre:',
    preguntaCompetenciaLibre: () => '¿Cómo se llama la competencia?',
    necesitoNombreCompetencia: () => 'Escribe el nombre de la competencia.',

    preguntaFormato: (formatoEquipo: string) =>
      `¿Formato del partido? El del equipo es ${formatoEquipo}.`,
    botonFormatoHabitual: 'El de siempre',
    botonFormatoOtro: 'Otro para este',

    creado: (detalle: string, formato: string) =>
      [
        'Partido creado ✅',
        detalle,
        `Formato: ${formato}`,
        '',
        'Cuando arranque, usa /cargar.',
      ].join('\n'),
  },

  reabrir: {
    preguntaEquipo: '¿De qué equipo?',
    sinPartidosCerrados: () => 'Ese equipo no tiene partidos cerrados.',
    preguntaCual: () => '¿Cuál quieres reabrir?',
    tocaUnPartido: () => 'Toca uno de los partidos:',
    yaLoReabrieron: () => 'Alguien lo reabrió antes que tú; ya se le puede cargar.',
    reabierto: (equipoNombre: string, rival: string, fecha: string) =>
      [
        `Partido reabierto ✅ ${equipoNombre} vs ${rival} — ${fecha}`,
        '',
        'Corrige lo que falte con /cargar y vuelve a cerrarlo con /finalizar.',
      ].join('\n'),
  },

  listar: {
    botonCrearPartido: 'Crear partido',
    sinPartidos: () => '  Sin partidos todavía.',
  },
};
