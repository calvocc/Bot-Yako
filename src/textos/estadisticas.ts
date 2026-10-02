/** Textos de `/stats` y `/tabla`. */

/** Lo que los bloques de la ficha necesitan: común a `lineaJugador` y `totalPersona`. */
interface CamposFicha {
  partidosJugados: number;
  minutos?: number;
  partidosConReloj?: number;
  goles: number;
  asistencias: number;
  tirosAlArco: number;
  regates: number;
  faltasRecibidas: number;
  recuperaciones: number;
  rechazos: number;
  atajadas: number;
  penalesAtajados: number;
  amarillas: number;
  rojas: number;
  autogoles: number;
  esArquero: boolean;
}

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

  /**
   * Ficha completa de un jugador: grupos por categoría más línea de
   * eficiencia. Los grupos secundarios se omiten en cero para que la ficha
   * siga compacta en el teléfono; la base (PJ/goles/asistencias) siempre se
   * muestra. `minutos`/`partidosConReloj` son ausentes en el bloque Total,
   * que agrega filas ya traídas sin recalcular minutos por equipo.
   */
  lineaJugador: (datos: {
    nombre: string;
    dorsal: number | null;
    equipoNombre: string;
    temporada: number;
    partidosJugados: number;
    minutos?: number;
    partidosConReloj?: number;
    goles: number;
    asistencias: number;
    tirosAlArco: number;
    regates: number;
    faltasRecibidas: number;
    recuperaciones: number;
    rechazos: number;
    atajadas: number;
    penalesAtajados: number;
    amarillas: number;
    rojas: number;
    autogoles: number;
    esArquero: boolean;
  }): string => {
    const dorsal = datos.dorsal !== null ? ` #${datos.dorsal}` : '';

    return [
      `📊 ${datos.nombre}${dorsal} — ${datos.equipoNombre} · temporada ${datos.temporada}`,
      '',
      ...bloqueParticipacion(datos),
      ...bloqueAtaque(datos),
      ...bloqueDefensa(datos),
      ...bloquePorteria(datos),
      ...bloqueDisciplina(datos),
    ].join('\n');
  },

  /**
   * Un bloque "Total" por persona: misma ficha que `lineaJugador` pero sin
   * minutos (agrega filas ya traídas) y con encabezado propio.
   */
  totalPersona: (datos: {
    nombre: string;
    temporada: number;
    equipos: number;
    partidosJugados: number;
    goles: number;
    asistencias: number;
    tirosAlArco: number;
    regates: number;
    faltasRecibidas: number;
    recuperaciones: number;
    rechazos: number;
    atajadas: number;
    penalesAtajados: number;
    amarillas: number;
    rojas: number;
    autogoles: number;
    esArquero: boolean;
  }): string => {
    return [
      `🧮 Total en la academia — ${datos.nombre} · temporada ${datos.temporada} (${datos.equipos} equipos)`,
      '',
      ...bloqueParticipacion(datos),
      ...bloqueAtaque(datos),
      ...bloqueDefensa(datos),
      ...bloquePorteria(datos),
      ...bloqueDisciplina(datos),
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

/** Promedio con 2 decimales (`0.75`); `—` si no hay divisor honesto. */
function promedio(numerador: number, divisor: number): string {
  if (divisor <= 0) return '—';

  return (numerador / divisor).toFixed(2);
}

/**
 * Minutos solo sobre partidos con reloj: un post partido nunca corrió uno,
 * así que mezclarlos inflaría el denominador del per-90 con minutos que
 * nadie midió.
 */
function lineaMinutos(datos: CamposFicha): string {
  const minutos = datos.minutos ?? 0;
  const conReloj = datos.partidosConReloj ?? 0;

  if (conReloj > 0 && conReloj >= datos.partidosJugados) {
    return `${datos.partidosJugados} partidos · ${minutos} min`;
  }

  if (conReloj === 0) return `${datos.partidosJugados} partidos · sin registro de minutos`;

  return `${datos.partidosJugados} partidos · ${minutos} min (reloj en ${conReloj})`;
}

function bloqueParticipacion(datos: CamposFicha): string[] {
  return ['🏟️ PARTICIPACIÓN', lineaMinutos(datos), ''];
}

function bloqueAtaque(datos: CamposFicha): string[] {
  const lineas = [
    '⚽ ATAQUE',
    `Goles: ${datos.goles} · Asistencias: ${datos.asistencias}`,
    `📈 ${promedio(datos.goles, datos.partidosJugados)} G/PJ · ${promedio(datos.goles + datos.asistencias, datos.partidosJugados)} contribuciones/PJ${lineaPor90(datos)}`,
  ];

  if (datos.tirosAlArco > 0 || datos.regates > 0 || datos.faltasRecibidas > 0) {
    lineas.push(
      `🎯 Tiros: ${datos.tirosAlArco} · 🤹 Regates: ${datos.regates} · 🤕 Faltas recibidas: ${datos.faltasRecibidas}`,
    );
  }

  return [...lineas, ''];
}

/** Contribuciones por 90' solo sobre minutos medidos; sin reloj no hay per-90 honesto. */
function lineaPor90(datos: CamposFicha): string {
  const minutos = datos.minutos ?? 0;

  if (minutos <= 0) return '';

  return ` · ${(((datos.goles + datos.asistencias) / minutos) * 90).toFixed(2)} contribuciones/90'`;
}

function bloqueDefensa(datos: CamposFicha): string[] {
  if (datos.recuperaciones === 0 && datos.rechazos === 0) return [];

  return [
    '🛡️ DEFENSA',
    `🔄 Recuperaciones: ${datos.recuperaciones} · 🧹 Rechazos: ${datos.rechazos}`,
    '',
  ];
}

/**
 * Solo si es arquero o tuvo intervenciones: en la ficha de un jugador de
 * campo sin atajadas este grupo confundiría más de lo que informa.
 */
function bloquePorteria(datos: CamposFicha): string[] {
  if (!datos.esArquero && datos.atajadas === 0 && datos.penalesAtajados === 0) return [];

  return [
    '🧤 PORTERÍA',
    `🧤 Atajadas: ${datos.atajadas} · 🥅 Penales atajados: ${datos.penalesAtajados}`,
    '',
  ];
}

function bloqueDisciplina(datos: CamposFicha): string[] {
  if (datos.amarillas === 0 && datos.rojas === 0 && datos.autogoles === 0) return [];

  return [
    '🟨 DISCIPLINA',
    `🟨 Amarillas: ${datos.amarillas} · 🟥 Rojas: ${datos.rojas} · 🙃 Autogoles: ${datos.autogoles}`,
  ];
}
