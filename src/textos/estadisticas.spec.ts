import { textos } from './estadisticas';

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
