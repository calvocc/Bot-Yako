/** Textos de `/stats` y `/tabla`. */
export const textos = {
  preguntaJugador: () =>
    '¿De qué jugador? Escribe /stats seguido del nombre, por ejemplo: /stats Jacob',

  lineaJugador: (datos: {
    nombre: string;
    dorsal: number | null;
    equipoNombre: string;
    temporada: number;
    partidosConEvento: number;
    goles: number;
    asistencias: number;
    amarillas: number;
  }): string => {
    const dorsal = datos.dorsal !== null ? ` #${datos.dorsal}` : '';

    return [
      `📊 ${datos.nombre}${dorsal} — ${datos.equipoNombre} · temporada ${datos.temporada}`,
      `Partidos jugados: ${datos.partidosConEvento}`,
      `Goles: ${datos.goles}  ·  Asistencias: ${datos.asistencias}  ·  Amarillas: ${datos.amarillas}`,
    ].join('\n');
  },

  totalPersona: (datos: {
    nombre: string;
    temporada: number;
    equipos: number;
    partidosConEvento: number;
    goles: number;
    asistencias: number;
    amarillas: number;
  }): string => {
    return [
      `🧮 Total en la academia — ${datos.nombre} · temporada ${datos.temporada} (${datos.equipos} equipos)`,
      `Partidos jugados: ${datos.partidosConEvento}`,
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
};
