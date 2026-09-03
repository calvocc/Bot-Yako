import { parsearMarcador } from './cargar.flujo';

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
