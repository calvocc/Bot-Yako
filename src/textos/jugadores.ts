/** Textos de `/plantilla` (ver, agregar, dar de baja). */
export const textos = {
  preguntaEquipo: '¿De cuál equipo quieres ver la plantilla?',

  ver: {
    plantillaVacia: () => 'Esta plantilla está vacía.',
    encabezado: (equipoNombre: string, cantidad: number, cuerpo: string) =>
      `📋 Plantilla de ${equipoNombre} (${cantidad}):\n\n${cuerpo}`,
    botonAgregar: 'Agregar',
    botonBaja: 'Dar de baja',
    botonCerrar: 'Listo',
    cerrado: () => 'Listo 👍',
  },

  agregar: {
    ningunoAgregado: () => 'No agregué a nadie.',
    agregados: (cantidad: number) =>
      `Listo, agregué ${cantidad} jugador${cantidad === 1 ? '' : 'es'}. ✅`,
  },

  baja: {
    pregunta: () => '¿A quién das de baja? Sus estadísticas de partidos ya jugados se conservan.',
    ningunoDeBaja: () => 'No di de baja a nadie.',
    dadoDeBaja: () => 'Jugador dado de baja ✅',
  },

  cargarPlantilla: {
    instrucciones: (comandoListo: string) =>
      [
        'Ahora carga la plantilla. Escribe *nombre y dorsal*, así:',
        '',
        'Jacob, 10',
        '',
        'Puedes mandar varios de una vez, uno por línea.',
        `Cuando termines, escribe ${comandoListo}.`,
      ].join('\n'),
    esComando: (comandoListo: string) =>
      `Para terminar escribe ${comandoListo}. Para agregar a alguien, "Jacob, 10".`,
    noEntendido: (comandoListo: string) =>
      `No entendí eso. Escribe algo como "Jacob, 10", o ${comandoListo} para terminar.`,
    resumenAlta: (van: number, comandoListo: string) =>
      `Van ${van} jugador${van === 1 ? '' : 'es'}. Sigue o escribe ${comandoListo}.`,
    listaLista: (cargados: number, siguiente: string) =>
      cargados === 0
        ? `Sin jugadores por ahora. Puedes cargarlos después con /plantilla.\n\n${siguiente}`
        : `Plantilla lista con ${cargados} jugador${cargados === 1 ? '' : 'es'}. ✅\n\n${siguiente}`,
  },
};
