import { textos } from './comunes';

describe('comunes.noEncontre', () => {
  it('sin sugerencia', () => {
    expect(textos.noEncontre('el partido')).toBe('🔍 No encontré el partido.');
  });

  it('con sugerencia', () => {
    expect(textos.noEncontre('a ese jugador', 'Revisa el nombre.')).toBe(
      '🔍 No encontré a ese jugador. Revisa el nombre.',
    );
  });
});

describe('comunes.permisoRevocado', () => {
  it('nombra el rol que hace falta, no un "permiso" genérico', () => {
    expect(textos.permisoRevocado('admin', 'no reabrí nada')).toBe(
      '🔒 Ya no eres admin de ese equipo, así que no reabrí nada.',
    );
    expect(textos.permisoRevocado('editor', 'no creé nada')).toBe(
      '🔒 Ya no eres editor de ese equipo, así que no creé nada.',
    );
  });
});

describe('comunes.preguntaFormatoCustom', () => {
  it('incluye los límites de tiempos y minutos', () => {
    const texto = textos.preguntaFormatoCustom({
      tiemposMin: 2,
      tiemposMax: 4,
      minutosMin: 15,
      minutosMax: 30,
    });

    expect(texto).toContain('(2-4 tiempos, 15-30 minutos)');
  });
});
