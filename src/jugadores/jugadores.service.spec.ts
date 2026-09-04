import { parsearGoleadores, parsearTarjetas } from './jugadores.service';

describe('parsearGoleadores', () => {
  it('interpreta "Nombre cantidad" separado por comas', () => {
    expect(parsearGoleadores('Jacob 2, Andrés 1')).toEqual([
      { nombre: 'Jacob', cantidad: 2 },
      { nombre: 'Andrés', cantidad: 1 },
    ]);
  });

  it('asume un solo gol si no hay número', () => {
    expect(parsearGoleadores('Jacob')).toEqual([{ nombre: 'Jacob', cantidad: 1 }]);
  });

  it('acepta el número antes del nombre', () => {
    expect(parsearGoleadores('2 Jacob')).toEqual([{ nombre: 'Jacob', cantidad: 2 }]);
  });

  it('rechaza un segmento sin nombre', () => {
    expect(parsearGoleadores('Jacob 2, 3')).toBeNull();
  });

  it('rechaza texto vacío', () => {
    expect(parsearGoleadores('   ')).toBeNull();
  });
});

describe('parsearTarjetas', () => {
  it('interpreta "Nombre color" separado por comas', () => {
    expect(parsearTarjetas('Andrés amarilla, Jacob roja')).toEqual([
      { nombre: 'Andrés', color: 'amarilla' },
      { nombre: 'Jacob', color: 'roja' },
    ]);
  });

  it('es insensible a mayúsculas y acepta el plural', () => {
    expect(parsearTarjetas('Andrés AMARILLAS')).toEqual([{ nombre: 'Andrés', color: 'amarilla' }]);
  });

  it('rechaza un color desconocido', () => {
    expect(parsearTarjetas('Andrés verde')).toBeNull();
  });

  it('rechaza un segmento sin nombre', () => {
    expect(parsearTarjetas('amarilla')).toBeNull();
  });

  it('rechaza texto vacío', () => {
    expect(parsearTarjetas('')).toBeNull();
  });
});
