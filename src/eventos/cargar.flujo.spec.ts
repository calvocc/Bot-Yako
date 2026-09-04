import { idsPorDorsalONombre, parsearMarcador } from './cargar.flujo';

describe('parsearMarcador', () => {
  it('entiende las formas en que se escribe un resultado', () => {
    expect(parsearMarcador('3-1')).toEqual({ propio: 3, rival: 1 });
    expect(parsearMarcador('3 a 1')).toEqual({ propio: 3, rival: 1 });
    expect(parsearMarcador(' 0:0 ')).toEqual({ propio: 0, rival: 0 });
  });

  it('rechaza lo que no es un marcador', () => {
    expect(parsearMarcador('falta un gol')).toBeNull();
    expect(parsearMarcador('3')).toBeNull();
    expect(parsearMarcador('1-2-3')).toBeNull();
    expect(parsearMarcador(undefined)).toBeNull();
    // Un dorsal pegado o una fecha darían números absurdos.
    expect(parsearMarcador('120-3')).toBeNull();
  });
});

describe('idsPorDorsalONombre', () => {
  const lista = [
    { id: 'jg:jacob', texto: 'Jacob #10' },
    { id: 'jg:andres', texto: 'Andrés #7' },
    { id: 'jg:sin-dorsal', texto: 'Samuel' },
  ];

  it('resuelve por dorsal, separados por coma', () => {
    expect(idsPorDorsalONombre('10, 7', lista)).toEqual(['jg:jacob', 'jg:andres']);
  });

  it('resuelve por nombre exacto (sin mayúsculas) como respaldo', () => {
    expect(idsPorDorsalONombre('jacob, ANDRÉS', lista)).toEqual(['jg:jacob', 'jg:andres']);
  });

  it('resuelve a alguien sin dorsal por nombre', () => {
    expect(idsPorDorsalONombre('samuel', lista)).toEqual(['jg:sin-dorsal']);
  });

  it('ignora tokens que no matchean a nadie, sin descartar los que sí', () => {
    expect(idsPorDorsalONombre('10, 99, jacob', lista)).toEqual(['jg:jacob']);
  });

  it('no repite un id ya resuelto por otro token', () => {
    expect(idsPorDorsalONombre('10, jacob', lista)).toEqual(['jg:jacob']);
  });

  it('devuelve null si no reconoce a nadie', () => {
    expect(idsPorDorsalONombre('99, nadie', lista)).toBeNull();
    expect(idsPorDorsalONombre('', lista)).toBeNull();
  });
});
