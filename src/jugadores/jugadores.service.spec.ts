import { parsearNombreJugador } from './jugadores.service';

describe('parsearNombreJugador', () => {
  it('acepta un nombre', () => {
    expect(parsearNombreJugador('Jacob')).toBe('Jacob');
  });

  it('recorta espacios de los bordes y colapsa los del medio', () => {
    expect(parsearNombreJugador('  Jacob   Restrepo  ')).toBe('Jacob Restrepo');
  });

  it('rechaza vacío', () => {
    expect(parsearNombreJugador('   ')).toBeNull();
  });

  it('rechaza un número a secas: sería un dorsal, no un nombre', () => {
    expect(parsearNombreJugador('10')).toBeNull();
  });
});
