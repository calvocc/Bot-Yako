import { parsearEstatura, parsearFechaNacimiento, parsearPeso } from './datos-fisicos';

const HOY = '2026-09-05';

describe('parsearFechaNacimiento', () => {
  it('interpreta dd/mm/aaaa', () => {
    expect(parsearFechaNacimiento('10/05/2018', HOY)).toBe('2018-05-10');
  });

  it('acepta guion o punto como separador', () => {
    expect(parsearFechaNacimiento('10-05-2018', HOY)).toBe('2018-05-10');
    expect(parsearFechaNacimiento('10.05.2018', HOY)).toBe('2018-05-10');
  });

  it('rechaza sin año', () => {
    expect(parsearFechaNacimiento('10/05', HOY)).toBeNull();
  });

  it('rechaza una fecha que no existe', () => {
    expect(parsearFechaNacimiento('31/02/2018', HOY)).toBeNull();
  });

  it('rechaza una fecha futura', () => {
    expect(parsearFechaNacimiento('10/05/2027', HOY)).toBeNull();
  });

  it('rechaza a alguien menor de 4 años', () => {
    // El 2026-09-05, un nacido el 2022-09-06 cumple 4 recién mañana.
    expect(parsearFechaNacimiento('06/09/2022', HOY)).toBeNull();
  });

  it('acepta al que cumple exactamente 4 hoy', () => {
    expect(parsearFechaNacimiento('05/09/2022', HOY)).toBe('2022-09-05');
  });

  it('rechaza a alguien mayor de 20 años', () => {
    expect(parsearFechaNacimiento('05/09/2005', HOY)).toBeNull();
  });

  it('acepta al que cumple exactamente 20 hoy', () => {
    expect(parsearFechaNacimiento('05/09/2006', HOY)).toBe('2006-09-05');
  });
});

describe('parsearPeso', () => {
  it('interpreta un número entero', () => {
    expect(parsearPeso('35')).toBe(35);
  });

  it('acepta coma o punto decimal', () => {
    expect(parsearPeso('35,5')).toBe(35.5);
    expect(parsearPeso('35.5')).toBe(35.5);
  });

  it('rechaza por debajo del mínimo', () => {
    expect(parsearPeso('9')).toBeNull();
  });

  it('rechaza por encima del máximo', () => {
    expect(parsearPeso('121')).toBeNull();
  });

  it('acepta los límites', () => {
    expect(parsearPeso('10')).toBe(10);
    expect(parsearPeso('120')).toBe(120);
  });

  it('rechaza texto que no es un número', () => {
    expect(parsearPeso('treinta')).toBeNull();
  });
});

describe('parsearEstatura', () => {
  it('interpreta un entero en centímetros', () => {
    expect(parsearEstatura('135')).toBe(135);
  });

  it('rechaza decimales', () => {
    expect(parsearEstatura('135.5')).toBeNull();
  });

  it('rechaza por debajo del mínimo', () => {
    expect(parsearEstatura('79')).toBeNull();
  });

  it('rechaza por encima del máximo', () => {
    expect(parsearEstatura('211')).toBeNull();
  });

  it('acepta los límites', () => {
    expect(parsearEstatura('80')).toBe(80);
    expect(parsearEstatura('210')).toBe(210);
  });
});
