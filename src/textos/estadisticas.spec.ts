import { textos } from './estadisticas';

describe('estadisticas.listadoJugadores', () => {
  it('incluye el equipo, el cuerpo y la invitación a pedir el detalle', () => {
    const texto = textos.listadoJugadores('Sub-11', '• Jacob #10\n• Andrés #7');

    expect(texto).toContain('📋 Sub-11:');
    expect(texto).toContain('• Jacob #10');
    expect(texto).toContain('/stats seguido de un nombre');
  });
});

describe('estadisticas.sinJugadores', () => {
  it('avisa que el equipo no tiene plantilla cargada', () => {
    expect(textos.sinJugadores()).toBe('Sin jugadores en este equipo todavía.');
  });
});

describe('estadisticas.lineaJugador', () => {
  it('incluye dorsal cuando existe', () => {
    const texto = textos.lineaJugador({
      nombre: 'Jacob',
      dorsal: 10,
      equipoNombre: 'Sub-11',
      temporada: 2026,
      partidosConEvento: 5,
      goles: 4,
      asistencias: 2,
      amarillas: 1,
    });

    expect(texto).toContain('📊 Jacob #10 — Sub-11 · temporada 2026');
    expect(texto).toContain('Partidos jugados: 5');
    expect(texto).toContain('Goles: 4  ·  Asistencias: 2  ·  Amarillas: 1');
  });

  it('omite el dorsal cuando es null', () => {
    const texto = textos.lineaJugador({
      nombre: 'Jacob',
      dorsal: null,
      equipoNombre: 'Sub-11',
      temporada: 2026,
      partidosConEvento: 5,
      goles: 4,
      asistencias: 2,
      amarillas: 1,
    });

    expect(texto).toContain('📊 Jacob — Sub-11');
    expect(texto).not.toContain('#');
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
