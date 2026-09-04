import { puedeSerDuplicado, segundosDesde } from './dedup';

describe('puedeSerDuplicado', () => {
  describe('eventos de un jugador (gol, tarjeta, asistencia)', () => {
    it('con dos jugadores identificados y distintos no hay ambigüedad (M1)', () => {
      // Jacob marcó y Andrés marca 40 segundos después: son dos goles, no un
      // reporte repetido. La regla original preguntaba igual.
      expect(
        puedeSerDuplicado(
          { modo: 'jugador', jugadorId: 'jacob' },
          { modo: 'jugador', jugadorId: 'andres' },
        ),
      ).toBe(false);
    });

    it('el mismo jugador dos veces sí es sospechoso', () => {
      expect(
        puedeSerDuplicado(
          { modo: 'jugador', jugadorId: 'jacob' },
          { modo: 'jugador', jugadorId: 'jacob' },
        ),
      ).toBe(true);
    });

    it('sin jugador identificado hay que preguntar', () => {
      expect(
        puedeSerDuplicado(
          { modo: 'jugador', jugadorId: null },
          { modo: 'jugador', jugadorId: 'jacob' },
        ),
      ).toBe(true);
      expect(
        puedeSerDuplicado(
          { modo: 'jugador', jugadorId: 'jacob' },
          { modo: 'jugador', jugadorId: null },
        ),
      ).toBe(true);
      expect(
        puedeSerDuplicado(
          { modo: 'jugador', jugadorId: null },
          { modo: 'jugador', jugadorId: null },
        ),
      ).toBe(true);
    });
  });

  describe('cambios', () => {
    it('con quien entra identificado y distinto no hay ambigüedad', () => {
      // Dos sustituciones a la vez, cada una mete a alguien distinto: no hay
      // nada que confundir, aunque el que sale sea el mismo en las dos.
      expect(
        puedeSerDuplicado(
          { modo: 'cambio', sale: 'jacob', entra: 'samuel' },
          { modo: 'cambio', sale: 'jacob', entra: 'camilo' },
        ),
      ).toBe(false);
    });

    it('la misma entrada dos veces sí es sospechosa', () => {
      expect(
        puedeSerDuplicado(
          { modo: 'cambio', sale: 'jacob', entra: 'samuel' },
          { modo: 'cambio', sale: 'andres', entra: 'samuel' },
        ),
      ).toBe(true);
    });

    it('sin quien entra identificado hay que preguntar', () => {
      expect(
        puedeSerDuplicado(
          { modo: 'cambio', sale: 'jacob', entra: null },
          { modo: 'cambio', sale: 'andres', entra: 'samuel' },
        ),
      ).toBe(true);
    });
  });
});

describe('segundosDesde', () => {
  it('redondea al segundo y nunca da negativo', () => {
    const ahora = new Date('2026-09-06T15:00:40Z');

    expect(segundosDesde(new Date('2026-09-06T15:00:00Z'), ahora)).toBe(40);
    expect(segundosDesde(new Date('2026-09-06T15:01:00Z'), ahora)).toBe(0);
  });
});
