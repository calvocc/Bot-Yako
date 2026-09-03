import { describirFecha, parsearFecha, sumarDias } from './fechas';

const HOY = '2026-09-06';

describe('parsearFecha', () => {
  it('entiende las palabras de todos los días', () => {
    expect(parsearFecha('hoy', HOY)).toBe(HOY);
    expect(parsearFecha('  AYER ', HOY)).toBe('2026-09-05');
    expect(parsearFecha('mañana', HOY)).toBe('2026-09-07');
  });

  it('acepta día y mes en cualquier separador', () => {
    expect(parsearFecha('12-10', HOY)).toBe('2026-10-12');
    expect(parsearFecha('12/10', HOY)).toBe('2026-10-12');
    expect(parsearFecha('3 . 9', HOY)).toBe('2026-09-03');
  });

  it('elige el año más cercano al cruzar diciembre', () => {
    // Escrito el 28 de diciembre, "05-01" es enero del año que viene.
    expect(parsearFecha('05-01', '2026-12-28')).toBe('2027-01-05');
    // Y escrito el 2 de enero, "28-12" es diciembre del año pasado.
    expect(parsearFecha('28-12', '2027-01-02')).toBe('2026-12-28');
  });

  it('respeta el año cuando viene escrito', () => {
    expect(parsearFecha('12-10-2024', HOY)).toBe('2024-10-12');
    expect(parsearFecha('12-10-24', HOY)).toBe('2024-10-12');
  });

  it('rechaza lo que no es una fecha', () => {
    expect(parsearFecha('el domingo', HOY)).toBeNull();
    expect(parsearFecha('31-02', HOY)).toBeNull();
    expect(parsearFecha('12-13', HOY)).toBeNull();
    expect(parsearFecha('', HOY)).toBeNull();
  });
});

describe('describirFecha', () => {
  it('usa palabras para los días cercanos', () => {
    expect(describirFecha(HOY, HOY)).toBe('hoy');
    expect(describirFecha(sumarDias(HOY, -1), HOY)).toBe('ayer');
  });

  it('agrega el año solo cuando es otro', () => {
    expect(describirFecha('2026-10-12', HOY)).toBe('12 oct');
    expect(describirFecha('2025-10-12', HOY)).toBe('12 oct 2025');
  });
});
