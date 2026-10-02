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
  it('incluye el equipo, el cuerpo y la invitación a tocar un jugador', () => {
    const texto = textos.elegirJugador('Sub-11', '• #10 Jacob\n• #7 Andrés');

    expect(texto).toContain('📋 Sub-11:');
    expect(texto).toContain('• #10 Jacob');
    expect(texto).toContain('Toca un jugador');
  });
});

describe('estadisticas.listaPartidosJugador', () => {
  it('encabeza con nombre, dorsal y equipo más las líneas', () => {
    const texto = textos.listaPartidosJugador('Jacob', 10, 'Sub-11', [
      "14/09 · vs Tigres · ⏱️ 58'",
    ]);

    expect(texto).toContain('📅 Partidos de Jacob #10 — Sub-11');
    expect(texto).toContain("14/09 · vs Tigres · ⏱️ 58'");
  });
});

describe('estadisticas.lineaPartidoJugado', () => {
  it('acorta la fecha y dice s/reloj sin minutos', () => {
    expect(textos.lineaPartidoJugado({ fecha: '2026-09-14', rival: 'Tigres', minutos: 58 })).toBe(
      "14/09 · vs Tigres · ⏱️ 58'",
    );
    expect(textos.lineaPartidoJugado({ fecha: '2026-09-14', rival: 'Tigres', minutos: null })).toBe(
      '14/09 · vs Tigres · ⏱️ s/reloj',
    );
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
    expect(texto).toContain('1 partidos · 58 min');
    expect(texto).toContain('Goles: 2 · Asistencias: 1');
    expect(texto).toContain('Tiros: 4 (+1 afuera)');
    expect(texto).toContain('🛡️ DEFENSA');
    expect(texto).not.toContain('🧤 PORTERÍA');
    expect(texto).not.toContain('🟨 DISCIPLINA');
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
  it('arma la ficha por grupos con eficiencia y minutos', () => {
    const texto = textos.lineaJugador(fichaBase);

    expect(texto).toContain('📊 Jacob #10 — Sub-11 · temporada 2026');
    expect(texto).toContain('🏟️ PARTICIPACIÓN');
    expect(texto).toContain('5 partidos · 300 min');
    expect(texto).toContain('⚽ ATAQUE');
    expect(texto).toContain('Goles: 4 · Asistencias: 2');
    expect(texto).toContain('Tiros: 12 (+4 afuera)');
    expect(texto).toContain('Pases: 30');
    expect(texto).toContain('Faltas cometidas: 2');
    expect(texto).toContain('0.80 G/PJ');
    expect(texto).toContain("contribuciones/90'");
    expect(texto).toContain('🛡️ DEFENSA');
    expect(texto).toContain('🟨 DISCIPLINA');
    // Jugador de campo sin atajadas: sin grupo portería.
    expect(texto).not.toContain('🧤 PORTERÍA');
  });

  it('omite el dorsal cuando es null', () => {
    const texto = textos.lineaJugador({ ...fichaBase, dorsal: null });

    expect(texto).toContain('📊 Jacob — Sub-11');
    expect(texto).not.toContain('#10');
  });

  it('sin reloj avisa y no calcula per-90', () => {
    const texto = textos.lineaJugador({
      ...fichaBase,
      minutos: 0,
      partidosConReloj: 0,
      recuperaciones: 0,
      rechazos: 0,
      amarillas: 0,
      faltasCometidas: 0,
    });

    expect(texto).toContain('sin registro de minutos');
    expect(texto).not.toContain("90'");
    expect(texto).not.toContain('🛡️ DEFENSA');
    expect(texto).not.toContain('🟨 DISCIPLINA');
  });

  it('muestra portería solo para arquero o con intervenciones', () => {
    expect(textos.lineaJugador({ ...fichaBase, esArquero: true })).toContain('🧤 PORTERÍA');
    expect(textos.lineaJugador({ ...fichaBase, atajadas: 2, penalesAtajados: 1 })).toContain(
      '🧤 PORTERÍA',
    );
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
