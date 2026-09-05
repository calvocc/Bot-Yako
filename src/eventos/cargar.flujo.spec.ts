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
  // Dato estructurado real, no la etiqueta ya renderizada del botón: es
  // justo lo que este fix cambia (antes se parseaba "Jacob #10" de vuelta).
  const jugadores = [
    { id: 'jg:jacob', nombre: 'Jacob', dorsal: 10 },
    { id: 'jg:andres', nombre: 'Andrés', dorsal: 7 },
    { id: 'jg:sin-dorsal', nombre: 'Samuel', dorsal: null },
  ];

  it('resuelve por dorsal, separados por coma', () => {
    expect(idsPorDorsalONombre('10, 7', jugadores)).toEqual({
      ids: ['jg:jacob', 'jg:andres'],
      sinReconocer: [],
    });
  });

  it('resuelve por nombre exacto (sin mayúsculas) como respaldo', () => {
    expect(idsPorDorsalONombre('jacob, ANDRÉS', jugadores)).toEqual({
      ids: ['jg:jacob', 'jg:andres'],
      sinReconocer: [],
    });
  });

  it('resuelve a alguien sin dorsal por nombre', () => {
    expect(idsPorDorsalONombre('samuel', jugadores)).toEqual({
      ids: ['jg:sin-dorsal'],
      sinReconocer: [],
    });
  });

  it('un cero a la izquierda igual matchea el dorsal (compara números, no el texto renderizado)', () => {
    expect(idsPorDorsalONombre('07', jugadores)).toEqual({
      ids: ['jg:andres'],
      sinReconocer: [],
    });
  });

  it('marca los tokens que no matchean a nadie en sinReconocer, sin descartar los que sí', () => {
    expect(idsPorDorsalONombre('10, 99, jacob', jugadores)).toEqual({
      ids: ['jg:jacob'],
      sinReconocer: ['99'],
    });
  });

  it('no repite un id ya resuelto por otro token', () => {
    expect(idsPorDorsalONombre('10, jacob', jugadores)).toEqual({
      ids: ['jg:jacob'],
      sinReconocer: [],
    });
  });

  it('devuelve null si no reconoce a nadie', () => {
    expect(idsPorDorsalONombre('99, nadie', jugadores)).toBeNull();
    expect(idsPorDorsalONombre('', jugadores)).toBeNull();
  });
});
