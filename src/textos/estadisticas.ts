/** Textos de `/stats` y `/tabla`. */
export const textos = {
  /** `/stats` sin nombre con 2+ equipos: primero se elige el equipo con botones. */
  eligeEquipo: () => '🏷️ ¿De qué equipo quieres ver estadísticas?\n\nToca uno 👇',
  /**
   * `/stats` sin nombre con un solo equipo, o tras elegir equipo con un
   * botón: plantilla con un botón por jugador, para no tener que escribir
   * el nombre. Todavía se puede escribir `/stats seguido de un nombre`.
   */
  elegirJugador: (equipoNombre: string, cuerpo: string) =>
    `📋 ${equipoNombre}:\n\n${cuerpo}\n\nToca un jugador para ver sus estadísticas 👇`,
  /** Plantilla vacía: sin jugadores no hay botones que ofrecer. */
  listadoJugadores: (equipoNombre: string, cuerpo: string) =>
    `📋 ${equipoNombre}:\n\n${cuerpo}\n\nEscribe /stats seguido de un nombre para ver sus estadísticas.`,
  sinJugadores: () => 'Sin jugadores en este equipo todavía.',
  /** Jugador elegido con un botón pero sin fila en la vista de la temporada. */
  sinEstadisticas: (nombre: string, temporada: number) =>
    `📊 ${nombre} — temporada ${temporada}\nTodavía no tiene estadísticas cargadas.`,

  lineaJugador: (datos: {
    nombre: string;
    dorsal: number | null;
    equipoNombre: string;
    temporada: number;
    partidosJugados: number;
    goles: number;
    asistencias: number;
    amarillas: number;
  }): string => {
    const dorsal = datos.dorsal !== null ? ` #${datos.dorsal}` : '';

    return [
      `📊 ${datos.nombre}${dorsal} — ${datos.equipoNombre} · temporada ${datos.temporada}`,
      `Partidos jugados: ${datos.partidosJugados}`,
      `Goles: ${datos.goles}  ·  Asistencias: ${datos.asistencias}  ·  Amarillas: ${datos.amarillas}`,
    ].join('\n');
  },

  totalPersona: (datos: {
    nombre: string;
    temporada: number;
    equipos: number;
    partidosJugados: number;
    goles: number;
    asistencias: number;
    amarillas: number;
  }): string => {
    return [
      `🧮 Total en la academia — ${datos.nombre} · temporada ${datos.temporada} (${datos.equipos} equipos)`,
      `Partidos jugados: ${datos.partidosJugados}`,
      `Goles: ${datos.goles}  ·  Asistencias: ${datos.asistencias}  ·  Amarillas: ${datos.amarillas}`,
    ].join('\n');
  },

  sinPartidosCerrados: (equipoNombre: string, temporada: number) =>
    `📋 ${equipoNombre} — temporada ${temporada}\nSin partidos cerrados todavía.`,

  bloqueEquipo: (datos: {
    equipoNombre: string;
    temporada: number;
    partidosJugados: number;
    ganados: number;
    empatados: number;
    perdidos: number;
    golesFavor: number;
    goleador: { nombre: string; goles: number } | null;
  }): string => {
    const perdidos = datos.perdidos === 1 ? '1 perdido' : `${datos.perdidos} perdidos`;
    const golLinea = datos.goleador
      ? ` · Goleador: ${datos.goleador.nombre} (${datos.goleador.goles})`
      : '';

    return [
      `📋 ${datos.equipoNombre} — temporada ${datos.temporada}`,
      `${datos.partidosJugados} partidos · ${datos.ganados} ganados · ${datos.empatados} empates · ${perdidos}`,
      `Goles a favor: ${datos.golesFavor}${golLinea}`,
    ].join('\n');
  },

  porCampeonato: () => 'Por campeonato:',
  /** Una línea por competencia (o el grupo "Sin competencia") del desglose de `/tabla`. */
  lineaCompetencia: (datos: {
    nombre: string;
    partidosJugados: number;
    ganados: number;
    empatados: number;
    perdidos: number;
    goleador: { nombre: string; goles: number } | null;
  }): string => {
    const golLinea = datos.goleador
      ? ` · Goleador: ${datos.goleador.nombre} (${datos.goleador.goles})`
      : '';

    return `🏆 ${datos.nombre}: ${datos.partidosJugados} partidos · ${datos.ganados}G ${datos.empatados}E ${datos.perdidos}P${golLinea}`;
  },
};
