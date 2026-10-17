/** Textos de `/stats` y `/tabla`. */

import type { Destacados, FilaRendimiento } from '../estadisticas/rendimiento';

/** Lo que los bloques de la ficha necesitan: común a `lineaJugador` y `totalPersona`. */
interface CamposFicha {
  partidosJugados: number;
  minutos?: number;
  partidosConReloj?: number;
  goles: number;
  asistencias: number;
  tirosAlArco: number;
  tirosAfuera: number;
  regates: number;
  faltasRecibidas: number;
  pases: number;
  recuperaciones: number;
  rechazos: number;
  atajadas: number;
  penalesAtajados: number;
  amarillas: number;
  rojas: number;
  autogoles: number;
  faltasCometidas: number;
  esArquero: boolean;
}

export const textos = {
  /** `/stats` sin nombre con 2+ equipos: primero se elige el equipo con botones. */
  eligeEquipo: () => '🏷️ ¿De qué equipo quieres ver estadísticas?\n\nToca uno 👇',
  /**
   * `/stats` sin nombre con un solo equipo, o tras elegir equipo con un
   * botón: solo los botones, uno por jugador, sin repetir la lista en el
   * texto —los botones ya son la lista y el texto queda alineado a la
   * izquierda. Todavía se puede escribir `/stats seguido de un nombre`.
   */
  elegirJugador: (equipoNombre: string) =>
    `📋 ${equipoNombre}:\n\nToca un jugador para ver sus estadísticas 👇`,
  /** Plantilla vacía: sin jugadores no hay botones que ofrecer. */
  listadoJugadores: (equipoNombre: string, cuerpo: string) =>
    `📋 ${equipoNombre}:\n\n${cuerpo}\n\nEscribe /stats seguido de un nombre para ver sus estadísticas.`,
  sinJugadores: () => 'Sin jugadores en este equipo todavía.',
  /** Jugador elegido con un botón pero sin fila en la vista de la temporada. */
  sinEstadisticas: (nombre: string, temporada: number) =>
    `📊 ${nombre} — temporada ${temporada}\nTodavía no tiene estadísticas cargadas.`,

  /** El jugador no participó en ningún cerrado: no hay lista de partidos. */
  sinPartidosJugador: (nombre: string, equipoNombre: string) =>
    `📅 ${nombre} todavía no jugó ningún partido cerrado con ${equipoNombre}.`,

  /**
   * `📅 Partidos` de la ficha: solo la invitación a tocar, sin lista en el
   * texto —cada botón ya lleva fecha, rival y minutos del partido.
   */
  listaPartidosJugador: (nombre: string, dorsal: number | null, equipoNombre: string) => {
    const dorsalTexto = dorsal !== null ? ` #${dorsal}` : '';

    return `📅 Partidos de ${nombre}${dorsalTexto} — ${equipoNombre}\n\nToca un partido para ver el detalle 👇`;
  },

  /**
   * Detalle de un partido del jugador: misma ficha que `lineaJugador` con
   * PJ=1 y los minutos de ese partido (o aviso sin reloj). El ritmo sobre
   * un partido dice si aportó uno o más goles en ese partido.
   */
  detallePartidoJugador: (datos: {
    nombre: string;
    dorsal: number | null;
    fecha: string;
    rival: string;
    minutos: number | null;
    goles: number;
    asistencias: number;
    tirosAlArco: number;
    tirosAfuera: number;
    regates: number;
    faltasRecibidas: number;
    pases: number;
    recuperaciones: number;
    rechazos: number;
    atajadas: number;
    penalesAtajados: number;
    amarillas: number;
    rojas: number;
    autogoles: number;
    faltasCometidas: number;
    esArquero: boolean;
  }): string => {
    const dorsal = datos.dorsal !== null ? ` #${datos.dorsal}` : '';
    const ficha: CamposFicha = {
      ...datos,
      partidosJugados: 1,
      minutos: datos.minutos ?? 0,
      partidosConReloj: datos.minutos === null ? 0 : 1,
    };

    return [
      `⚽ ${datos.nombre}${dorsal} — ${fechaLarga(datos.fecha)} · vs ${datos.rival}`,
      '',
      ...bloqueParticipacion(ficha),
      ...bloqueAtaque(ficha, 'en el partido'),
      ...bloqueDefensa(ficha),
      ...bloquePorteria(ficha),
      ...bloqueDisciplina(ficha),
    ].join('\n');
  },

  /**
   * Ficha completa de un jugador: grupos por categoría en lenguaje simple,
   * sin promedios técnicos. Los grupos de defensa y portería se omiten en
   * cero para que la ficha siga compacta en el teléfono; disciplina siempre
   * se muestra. `minutos`/`partidosConReloj` son ausentes en el bloque
   * Total, que agrega filas ya traídas sin recalcular minutos por equipo.
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
    tirosAfuera: number;
    regates: number;
    faltasRecibidas: number;
    pases: number;
    recuperaciones: number;
    rechazos: number;
    atajadas: number;
    penalesAtajados: number;
    amarillas: number;
    rojas: number;
    autogoles: number;
    faltasCometidas: number;
    esArquero: boolean;
  }): string => {
    const dorsal = datos.dorsal !== null ? ` #${datos.dorsal}` : '';

    return [
      `📊 ${datos.nombre}${dorsal} — ${datos.equipoNombre} · Temporada ${datos.temporada}`,
      '',
      ...bloqueParticipacion(datos),
      ...bloqueAtaque(datos, 'en total'),
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
    tirosAfuera: number;
    regates: number;
    faltasRecibidas: number;
    pases: number;
    recuperaciones: number;
    rechazos: number;
    atajadas: number;
    penalesAtajados: number;
    amarillas: number;
    rojas: number;
    autogoles: number;
    faltasCometidas: number;
    esArquero: boolean;
  }): string => {
    return [
      `🧮 Total en la academia — ${datos.nombre} · temporada ${datos.temporada} (${datos.equipos} equipos)`,
      '',
      ...bloqueParticipacion(datos),
      ...bloqueAtaque(datos, 'en total'),
      ...bloqueDefensa(datos),
      ...bloquePorteria(datos),
      ...bloqueDisciplina(datos),
    ].join('\n');
  },

  sinPartidosCerrados: (equipoNombre: string, temporada: number) =>
    `📋 ${equipoNombre} — temporada ${temporada}\nSin partidos cerrados todavía.`,

  /** `/tabla` con 2+ equipos: primero se elige el equipo con botones. */
  eligeEquipoTabla: () => '🏷️ ¿De qué equipo quieres ver la tabla?\n\nToca uno 👇',

  /**
   * Ficha del equipo: resultados y goles en lenguaje simple. Los bloques de
   * campeonatos, aportes, portería y disciplina los agrega el handler
   * después, en el mismo mensaje.
   */
  fichaEquipo: (datos: {
    equipoNombre: string;
    temporada: number;
    partidosJugados: number;
    ganados: number;
    empatados: number;
    perdidos: number;
    golesFavor: number;
    golesContra: number;
  }): string[] => {
    const diferencia = datos.golesFavor - datos.golesContra;
    const promedio =
      datos.partidosJugados > 0 ? (datos.golesFavor / datos.partidosJugados).toFixed(1) : '—';

    return [
      `📋 ${datos.equipoNombre} — Temporada ${datos.temporada}`,
      '',
      '🏟️ RESULTADOS',
      `${plural(datos.partidosJugados, 'partido', 'partidos')} · 🟢 ${plural(datos.ganados, 'ganado', 'ganados')} · 🟡 ${plural(datos.empatados, 'empate', 'empates')} · 🔴 ${plural(datos.perdidos, 'perdido', 'perdidos')}`,
      '',
      '⚽ GOLES',
      `${plural(datos.golesFavor, 'gol', 'goles')} a favor · ${datos.golesContra} en contra · 📊 Diferencia: ${diferencia > 0 ? `+${diferencia}` : `${diferencia}`}`,
      `📈 Promedio: ${promedio} goles por partido`,
      '',
    ];
  },

  tituloCampeonatos: () => '🏆 POR CAMPEONATO',

  /**
   * Un bloque por competencia (o el grupo "Sin competencia"). El MVP es el
   * jugador con más puntos brutos sumados en ese campeonato; si nadie sumó
   * en positivo no hay a quién destacar y la línea se omite.
   */
  bloqueCampeonato: (datos: {
    nombre: string;
    partidosJugados: number;
    ganados: number;
    empatados: number;
    perdidos: number;
    golesFavor: number;
    goleador: { nombre: string; goles: number } | null;
    mvp: { nombre: string; puntos: number } | null;
  }): string[] => {
    const lineas = [
      `🏆 ${datos.nombre}`,
      `${plural(datos.partidosJugados, 'partido', 'partidos')} · 🟢 ${datos.ganados}G · 🟡 ${datos.empatados}E · 🔴 ${datos.perdidos}P`,
      `⚽ ${plural(datos.golesFavor, 'gol', 'goles')} a favor`,
    ];

    if (datos.goleador) {
      lineas.push(
        `🥇 Goleador: ${datos.goleador.nombre} (${plural(datos.goleador.goles, 'gol', 'goles')})`,
      );
    }

    if (datos.mvp) {
      lineas.push(`⭐ MVP: ${datos.mvp.nombre} (${puntosTexto(datos.mvp.puntos)} pts)`);
    }

    return [...lineas, ''];
  },

  /**
   * Suma del equipo en la temporada (bloques APORTES/PORTERÍA/DISCIPLINA de
   * `/tabla`): los tiros combinan arco + afuera, como en la ficha del
   * jugador.
   */
  aportesEquipo: (datos: {
    goles: number;
    asistencias: number;
    tirosAlArco: number;
    tirosAfuera: number;
    regates: number;
    recuperaciones: number;
    rechazos: number;
  }): string[] => [
    '👥 APORTES DEL EQUIPO',
    `⚽ ${plural(datos.goles, 'gol', 'goles')} · 🅰️ ${plural(datos.asistencias, 'asistencia', 'asistencias')}`,
    `🎯 ${plural(datos.tirosAlArco + datos.tirosAfuera, 'tiro', 'tiros')} · 🤹 ${plural(datos.regates, 'regate', 'regates')}`,
    `🔄 ${plural(datos.recuperaciones, 'recuperación', 'recuperaciones')} · 🧹 ${plural(datos.rechazos, 'rechazo', 'rechazos')}`,
    '',
  ],

  /** Solo si hubo intervenciones: en cero este grupo no informa nada. */
  porteriaEquipo: (datos: { atajadas: number; penalesAtajados: number }): string[] => {
    if (datos.atajadas === 0 && datos.penalesAtajados === 0) return [];

    return [
      '🧤 PORTERÍA',
      `🧤 ${plural(datos.atajadas, 'atajada', 'atajadas')} · 🥅 ${plural(datos.penalesAtajados, 'penal atajado', 'penales atajados')}`,
      '',
    ];
  },

  /**
   * Botón "📈 Rendimiento" de `/tabla`: destacados de la temporada, goles
   * recibidos por los arqueros y el listado de todo el equipo con su
   * promedio (0–10, el de la nota por partido) y un mini resumen.
   */
  rendimientoEquipo: (datos: {
    equipoNombre: string;
    temporada: number;
    golesContra: number;
    destacados: Destacados;
    filas: FilaRendimiento[];
  }): string => {
    const { goleador, mejorPromedio, peorPromedio, masAmonestado, arqueros } = datos.destacados;
    const lineas = [
      `📈 Rendimiento — ${datos.equipoNombre} · Temporada ${datos.temporada}`,
      '',
      '⭐ DESTACADOS',
      goleador
        ? `🥇 Goleador: ${nombreConDorsal(goleador)} (${plural(goleador.goles, 'gol', 'goles')})`
        : '🥇 Goleador: nadie anotó todavía',
    ];

    if (mejorPromedio) {
      lineas.push(
        `📈 Mejor promedio: ${nombreConDorsal(mejorPromedio)} — ${promedioDe(mejorPromedio)}`,
      );
    }

    if (peorPromedio) {
      lineas.push(
        `📉 Promedio más bajo: ${nombreConDorsal(peorPromedio)} — ${promedioDe(peorPromedio)}`,
      );
    }

    lineas.push(
      masAmonestado
        ? `🟨 Más amonestado: ${nombreConDorsal(masAmonestado)} (${tarjetas(masAmonestado)})`
        : '🟨 Más amonestado: nadie vio tarjeta 👏',
      '',
      `🧤 PORTERÍA — ${plural(datos.golesContra, 'gol recibido', 'goles recibidos')}`,
    );

    if (arqueros.length === 0) {
      lineas.push(
        'Sin arquero registrado en los partidos (asígnale la posición con /editarjugador).',
      );
    }

    for (const arquero of arqueros) {
      const recibidos = arquero.golesRecibidos ?? 0;
      const porPartido =
        arquero.partidosAtajados > 0 ? (recibidos / arquero.partidosAtajados).toFixed(1) : '—';

      lineas.push(
        `${nombreConDorsal(arquero)}: ${plural(recibidos, 'gol', 'goles')} en ${plural(arquero.partidosAtajados, 'partido', 'partidos')} (${porPartido} por partido)`,
      );
    }

    lineas.push('', '👥 JUGADORES');

    for (const fila of datos.filas) {
      const promedio = fila.promedio !== null ? `⭐ ${fila.promedio.toFixed(1)}` : '⭐ —';

      lineas.push(`${promedio} · ${nombreConDorsal(fila)}`, `     ${miniResumen(fila)}`);
    }

    return lineas.join('\n');
  },

  /** Siempre visible: un "0 amarillas · 0 rojas" también informa. */
  disciplinaEquipo: (datos: { amarillas: number; rojas: number; autogoles: number }): string[] => [
    '🟨 DISCIPLINA',
    `🟨 ${plural(datos.amarillas, 'amarilla', 'amarillas')} · 🟥 ${plural(datos.rojas, 'roja', 'rojas')} · 🙃 ${plural(datos.autogoles, 'autogol', 'autogoles')}`,
  ],
};

/** `Jacob #10` / `Jacob`: mismo formato que el encabezado de la ficha. */
function nombreConDorsal(fila: { nombre: string; dorsal: number | null }): string {
  return fila.dorsal !== null ? `${fila.nombre} #${fila.dorsal}` : fila.nombre;
}

/** `7.4 en 6 partidos`. */
function promedioDe(fila: FilaRendimiento): string {
  return `${(fila.promedio ?? 0).toFixed(1)} en ${plural(fila.partidosConNota, 'partido', 'partidos')}`;
}

/** `2 amarillas · 1 roja`, omitiendo la que esté en cero. */
function tarjetas(fila: { amarillas: number; rojas: number }): string {
  return [
    fila.amarillas > 0 ? plural(fila.amarillas, 'amarilla', 'amarillas') : undefined,
    fila.rojas > 0 ? plural(fila.rojas, 'roja', 'rojas') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Lo importante del jugador en una línea: partidos y solo los números que
 * no están en cero, para que el listado de todo el equipo siga entrando en
 * la pantalla del teléfono.
 */
function miniResumen(fila: FilaRendimiento): string {
  if (fila.partidosJugados === 0 && fila.partidosConNota === 0) return 'sin partidos todavía';

  const partes = [
    plural(Math.max(fila.partidosJugados, fila.partidosConNota), 'partido', 'partidos'),
  ];

  if (fila.goles > 0) partes.push(`⚽ ${fila.goles}`);
  if (fila.asistencias > 0) partes.push(`🅰️ ${fila.asistencias}`);
  if (fila.golesRecibidos !== null) {
    partes.push(plural(fila.golesRecibidos, 'gol recibido', 'goles recibidos'));
  }
  if (fila.atajadas > 0) partes.push(`🧤 ${fila.atajadas}`);
  if (fila.penalesAtajados > 0) {
    partes.push(`🥅 ${plural(fila.penalesAtajados, 'penal atajado', 'penales atajados')}`);
  }
  if (fila.recuperaciones > 0) partes.push(`🔄 ${fila.recuperaciones}`);
  if (fila.amarillas > 0) partes.push(`🟨 ${fila.amarillas}`);
  if (fila.rojas > 0) partes.push(`🟥 ${fila.rojas}`);

  return partes.join(' · ');
}

/** `12 pts` / `12.5 pts`: sin decimal colgando cuando la suma es exacta. */
function puntosTexto(puntos: number): string {
  return Number.isInteger(puntos) ? `${puntos}` : puntos.toFixed(1);
}

/** `2026-09-14` → `14/09/2026`: fecha larga del encabezado del detalle. */
function fechaLarga(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');

  return dia && mes && anio ? `${dia}/${mes}/${anio}` : fecha;
}

/**
 * `1 partido` / `3 partidos`: el singular solo cuando es exactamente 1
 * (el 0 va en plural, como en "0 goles").
 */
function plural(cantidad: number, singular: string, pluralPalabra: string): string {
  return cantidad === 1 ? `1 ${singular}` : `${cantidad} ${pluralPalabra}`;
}

function bloqueParticipacion(datos: CamposFicha): string[] {
  const lineas = ['🏟️ PARTICIPACIÓN', plural(datos.partidosJugados, 'partido', 'partidos')];

  // El bloque Total agrega filas ya traídas y no trae minutos: ahí no se
  // menciona el reloj en vez de afirmar algo ("sin registro") que no se
  // midió. `pases` y `faltasCometidas` se siguen guardando pero no se
  // muestran: la ficha enseña lo que se lee de un vistazo.
  if (datos.minutos !== undefined || datos.partidosConReloj !== undefined) {
    const conReloj = datos.partidosConReloj ?? 0;

    lineas.push(
      conReloj > 0
        ? `⏱️ ${datos.minutos ?? 0} min registrados en ${plural(conReloj, 'partido', 'partidos')}`
        : '⏱️ sin registro de minutos',
    );
  }

  return [...lineas, ''];
}

function bloqueAtaque(datos: CamposFicha, ambito: 'en total' | 'en el partido'): string[] {
  const aportes = datos.goles + datos.asistencias;

  return [
    '⚽ ATAQUE',
    `⚽ ${plural(datos.goles, 'gol', 'goles')} · 🅰️ ${plural(datos.asistencias, 'asistencia', 'asistencias')}`,
    `🔥 ${plural(aportes, 'aporte', 'aportes')} de gol ${ambito}`,
    ...lineaRitmo(datos, aportes),
    `🎯 ${plural(datos.tirosAlArco + datos.tirosAfuera, 'tiro', 'tiros')} · 🤹 ${plural(datos.regates, 'regate', 'regates')} · 🤕 ${plural(datos.faltasRecibidas, 'falta recibida', 'faltas recibidas')}`,
    '',
  ];
}

/**
 * Ritmo de aporte en palabras, sin decimales: cada cuántos partidos cae un
 * gol en el que participó directamente. Sin aportes no hay ritmo que contar.
 */
function lineaRitmo(datos: CamposFicha, aportes: number): string[] {
  if (aportes === 0 || datos.partidosJugados === 0) return [];

  const cada = datos.partidosJugados / aportes;

  if (cada >= 2) {
    return [`📈 Participó directamente en un gol cada ${Math.round(cada)} partidos`];
  }

  if (cada >= 1) return ['📈 Un aporte de gol por partido'];

  return ['📈 Más de un aporte de gol por partido'];
}

function bloqueDefensa(datos: CamposFicha): string[] {
  if (datos.recuperaciones === 0 && datos.rechazos === 0) return [];

  return [
    '🛡️ DEFENSA',
    `🔄 ${plural(datos.recuperaciones, 'recuperación', 'recuperaciones')} · 🧹 ${plural(datos.rechazos, 'rechazo', 'rechazos')}`,
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
    `🧤 ${plural(datos.atajadas, 'atajada', 'atajadas')} · 🥅 ${plural(datos.penalesAtajados, 'penal atajado', 'penales atajados')}`,
    '',
  ];
}

/** Disciplina siempre visible: un "0 amarillas · 0 rojas" también informa. */
function bloqueDisciplina(datos: CamposFicha): string[] {
  return [
    '🟨 DISCIPLINA',
    `🟨 ${plural(datos.amarillas, 'amarilla', 'amarillas')} · 🟥 ${plural(datos.rojas, 'roja', 'rojas')} · 🙃 ${plural(datos.autogoles, 'autogol', 'autogoles')}`,
  ];
}
