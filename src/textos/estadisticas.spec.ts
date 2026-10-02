import { textos } from './estadisticas';

describe('estadisticas.listadoJugadores', () => {
  it('incluye el equipo, el cuerpo y la invitación a pedir el detalle', () => {
    const texto = textos.listadoJugadores('Sub-11', '• Jacob #10\n• Andrés #7');

    expect(texto).toContain('📋 Sub-11:');
    expect(texto).toContain('• Jacob #10');
    expect(texto).toContain('/stats seguido de un nombre');
  });
});

describe('estadisticas.eligeEquipo', () => {
  it('pide tocar un equipo', () => {
    const texto = textos.eligeEquipo();

    expect(texto).toContain('¿De qué equipo quieres ver estadísticas?');
  });
});

describe('estadisticas.elegirJugador', () => {
  it('solo invita a tocar un botón: la lista vive en los botones, no en el texto', () => {
    const texto = textos.elegirJugador('Sub-11');

    expect(texto).toContain('📋 Sub-11:');
    expect(texto).toContain('Toca un jugador');
    expect(texto).not.toContain('•');
  });
});

describe('estadisticas.listaPartidosJugador', () => {
  it('solo invita a tocar: la lista vive en los botones, no en el texto', () => {
    const texto = textos.listaPartidosJugador('Jacob', 10, 'Sub-11');

    expect(texto).toContain('📅 Partidos de Jacob #10 — Sub-11');
    expect(texto).toContain('Toca un partido');
    expect(texto).not.toContain('Tigres');
    expect(texto).not.toContain('14/09');
  });
});

describe('estadisticas.detallePartidoJugador', () => {
  it('reutiliza los grupos con PJ=1 y el ritmo del partido', () => {
    const texto = textos.detallePartidoJugador({
      nombre: 'Jacob',
      dorsal: 10,
      fecha: '2026-09-14',
      rival: 'Tigres',
      minutos: 58,
      goles: 2,
      asistencias: 1,
      tirosAlArco: 4,
      tirosAfuera: 1,
      regates: 2,
      faltasRecibidas: 1,
      pases: 10,
      recuperaciones: 2,
      rechazos: 1,
      atajadas: 0,
      penalesAtajados: 0,
      amarillas: 0,
      rojas: 0,
      autogoles: 0,
      faltasCometidas: 0,
      esArquero: false,
    });

    expect(texto).toContain('⚽ Jacob #10 — 14/09/2026 · vs Tigres');
    expect(texto).toContain('1 partido');
    expect(texto).toContain('⏱️ 58 min registrados en 1 partido');
    expect(texto).toContain('⚽ 2 goles · 🅰️ 1 asistencia');
    expect(texto).toContain('🔥 3 aportes de gol en el partido');
    expect(texto).toContain('📈 Más de un aporte de gol por partido');
    expect(texto).toContain('🎯 5 tiros · 🤹 2 regates · 🤕 1 falta recibida');
    expect(texto).toContain('🛡️ DEFENSA');
    expect(texto).not.toContain('🧤 PORTERÍA');
    // Disciplina siempre se muestra, aunque sea todo cero.
    expect(texto).toContain('🟨 0 amarillas · 🟥 0 rojas · 🙃 0 autogoles');
  });
});

describe('estadisticas.sinEstadisticas', () => {
  it('dice de quién y de qué temporada no hay nada cargado', () => {
    const texto = textos.sinEstadisticas('Jacob', 2026);

    expect(texto).toContain('Jacob');
    expect(texto).toContain('2026');
    expect(texto).toContain('Todavía no tiene estadísticas cargadas');
  });
});

describe('estadisticas.sinJugadores', () => {
  it('avisa que el equipo no tiene plantilla cargada', () => {
    expect(textos.sinJugadores()).toBe('Sin jugadores en este equipo todavía.');
  });
});

const fichaBase = {
  nombre: 'Jacob',
  dorsal: 10 as number | null,
  equipoNombre: 'Sub-11',
  temporada: 2026,
  partidosJugados: 5,
  minutos: 300,
  partidosConReloj: 5,
  goles: 4,
  asistencias: 2,
  tirosAlArco: 12,
  tirosAfuera: 4,
  regates: 5,
  faltasRecibidas: 3,
  pases: 30,
  recuperaciones: 9,
  rechazos: 4,
  atajadas: 0,
  penalesAtajados: 0,
  amarillas: 1,
  rojas: 0,
  autogoles: 0,
  faltasCometidas: 2,
  esArquero: false,
};

describe('estadisticas.lineaJugador', () => {
  it('arma la ficha por grupos en lenguaje simple, con minutos y ritmo', () => {
    const texto = textos.lineaJugador(fichaBase);

    expect(texto).toContain('📊 Jacob #10 — Sub-11 · Temporada 2026');
    expect(texto).toContain('🏟️ PARTICIPACIÓN');
    expect(texto).toContain('5 partidos');
    expect(texto).toContain('⏱️ 300 min registrados en 5 partidos');
    expect(texto).toContain('⚽ ATAQUE');
    expect(texto).toContain('⚽ 4 goles · 🅰️ 2 asistencias');
    expect(texto).toContain('🔥 6 aportes de gol en total');
    expect(texto).toContain('📈 Más de un aporte de gol por partido');
    expect(texto).toContain('🎯 16 tiros · 🤹 5 regates · 🤕 3 faltas recibidas');
    // Sin tecnicismos: ni G/PJ, ni per-90, ni pases, ni faltas cometidas.
    expect(texto).not.toContain('G/PJ');
    expect(texto).not.toContain("90'");
    expect(texto).not.toContain('Pases');
    expect(texto).not.toContain('cometidas');
    expect(texto).toContain('🛡️ DEFENSA');
    expect(texto).toContain('🔄 9 recuperaciones · 🧹 4 rechazos');
    expect(texto).toContain('🟨 DISCIPLINA');
    expect(texto).toContain('🟨 1 amarilla · 🟥 0 rojas · 🙃 0 autogoles');
    // Jugador de campo sin atajadas: sin grupo portería.
    expect(texto).not.toContain('🧤 PORTERÍA');
  });

  it('dice cada cuántos partidos cae un aporte cuando el ritmo es menor', () => {
    const texto = textos.lineaJugador({
      ...fichaBase,
      nombre: 'Jacob Calvo',
      dorsal: 26,
      equipoNombre: '2015 Azul',
      partidosJugados: 9,
      minutos: 202,
      partidosConReloj: 5,
      goles: 3,
      asistencias: 1,
      tirosAlArco: 4,
      tirosAfuera: 0,
      regates: 2,
      faltasRecibidas: 0,
      recuperaciones: 1,
      rechazos: 1,
      atajadas: 1,
      penalesAtajados: 0,
      amarillas: 0,
      rojas: 0,
      autogoles: 0,
      faltasCometidas: 0,
    });

    expect(texto).toContain('📊 Jacob Calvo #26 — 2015 Azul · Temporada 2026');
    expect(texto).toContain('9 partidos');
    expect(texto).toContain('⏱️ 202 min registrados en 5 partidos');
    expect(texto).toContain('⚽ 3 goles · 🅰️ 1 asistencia');
    expect(texto).toContain('🔥 4 aportes de gol en total');
    expect(texto).toContain('📈 Participó directamente en un gol cada 2 partidos');
    expect(texto).toContain('🎯 4 tiros · 🤹 2 regates · 🤕 0 faltas recibidas');
    expect(texto).toContain('🔄 1 recuperación · 🧹 1 rechazo');
    expect(texto).toContain('🧤 1 atajada · 🥅 0 penales atajados');
    expect(texto).toContain('🟨 0 amarillas · 🟥 0 rojas · 🙃 0 autogoles');
  });

  it('omite el dorsal cuando es null', () => {
    const texto = textos.lineaJugador({ ...fichaBase, dorsal: null });

    expect(texto).toContain('📊 Jacob — Sub-11');
    expect(texto).not.toContain('#10');
  });

  it('sin reloj avisa sin tecnicismos y disciplina igual se muestra', () => {
    const texto = textos.lineaJugador({
      ...fichaBase,
      minutos: 0,
      partidosConReloj: 0,
      recuperaciones: 0,
      rechazos: 0,
      amarillas: 0,
      faltasCometidas: 0,
    });

    expect(texto).toContain('⏱️ sin registro de minutos');
    expect(texto).not.toContain("90'");
    expect(texto).not.toContain('🛡️ DEFENSA');
    expect(texto).toContain('🟨 DISCIPLINA');
    expect(texto).toContain('🟨 0 amarillas · 🟥 0 rojas · 🙃 0 autogoles');
  });

  it('muestra portería solo para arquero o con intervenciones', () => {
    expect(textos.lineaJugador({ ...fichaBase, esArquero: true })).toContain('🧤 PORTERÍA');
    const texto = textos.lineaJugador({ ...fichaBase, atajadas: 2, penalesAtajados: 1 });

    expect(texto).toContain('🧤 PORTERÍA');
    expect(texto).toContain('🧤 2 atajadas · 🥅 1 penal atajado');
  });
});

describe('estadisticas.bloqueEquipo', () => {
  it('pluraliza "perdidos" salvo cuando es 1', () => {
    const base = {
      equipoNombre: 'Sub-11',
      temporada: 2026,
      partidosJugados: 3,
      ganados: 1,
      empatados: 1,
      golesFavor: 5,
      goleador: null,
    };

    expect(textos.bloqueEquipo({ ...base, perdidos: 1 })).toContain('1 perdido');
    expect(textos.bloqueEquipo({ ...base, perdidos: 2 })).toContain('2 perdidos');
  });

  it('incluye al goleador cuando lo hay', () => {
    const texto = textos.bloqueEquipo({
      equipoNombre: 'Sub-11',
      temporada: 2026,
      partidosJugados: 3,
      ganados: 1,
      empatados: 1,
      perdidos: 1,
      golesFavor: 5,
      goleador: { nombre: 'Jacob', goles: 4 },
    });

    expect(texto).toContain('Goleador: Jacob (4)');
  });

  it('omite la línea de goleador cuando no hay', () => {
    const texto = textos.bloqueEquipo({
      equipoNombre: 'Sub-11',
      temporada: 2026,
      partidosJugados: 0,
      ganados: 0,
      empatados: 0,
      perdidos: 0,
      golesFavor: 0,
      goleador: null,
    });

    expect(texto).not.toContain('Goleador');
  });
});

describe('estadisticas.lineaCompetencia', () => {
  it('incluye el nombre del campeonato y el resultado', () => {
    const texto = textos.lineaCompetencia({
      nombre: 'Liga del Atlántico',
      partidosJugados: 10,
      ganados: 6,
      empatados: 2,
      perdidos: 2,
      goleador: null,
    });

    expect(texto).toBe('🏆 Liga del Atlántico: 10 partidos · 6G 2E 2P');
  });

  it('incluye al goleador del campeonato cuando lo hay', () => {
    const texto = textos.lineaCompetencia({
      nombre: 'Copa Relámpago',
      partidosJugados: 3,
      ganados: 2,
      empatados: 1,
      perdidos: 0,
      goleador: { nombre: 'Jacob', goles: 5 },
    });

    expect(texto).toContain('Goleador: Jacob (5)');
  });

  it('acepta "Sin competencia" como nombre del grupo sin campeonato', () => {
    const texto = textos.lineaCompetencia({
      nombre: 'Sin competencia',
      partidosJugados: 2,
      ganados: 1,
      empatados: 0,
      perdidos: 1,
      goleador: null,
    });

    expect(texto).toContain('🏆 Sin competencia: 2 partidos');
  });
});
