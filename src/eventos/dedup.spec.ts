import { puedeSerDuplicado, segundosDesde } from './dedup';

describe('puedeSerDuplicado', () => {
  it('con dos jugadores identificados y distintos no hay ambigüedad (M1)', () => {
    // Jacob marcó y Andrés marca 40 segundos después: son dos goles, no un
    // reporte repetido. La regla original preguntaba igual.
    expect(puedeSerDuplicado({ jugadorId: 'jacob' }, { jugadorId: 'andres' })).toBe(false);
  });

  it('el mismo jugador dos veces sí es sospechoso', () => {
    expect(puedeSerDuplicado({ jugadorId: 'jacob' }, { jugadorId: 'jacob' })).toBe(true);
  });

  it('sin jugador identificado hay que preguntar', () => {
    expect(puedeSerDuplicado({ jugadorId: null }, { jugadorId: 'jacob' })).toBe(true);
    expect(puedeSerDuplicado({ jugadorId: 'jacob' }, { jugadorId: null })).toBe(true);
    expect(puedeSerDuplicado({ jugadorId: null }, { jugadorId: null })).toBe(true);
  });
});

describe('segundosDesde', () => {
  it('redondea al segundo y nunca da negativo', () => {
    const ahora = new Date('2026-09-06T15:00:40Z');

    expect(segundosDesde(new Date('2026-09-06T15:00:00Z'), ahora)).toBe(40);
    expect(segundosDesde(new Date('2026-09-06T15:01:00Z'), ahora)).toBe(0);
  });
});
