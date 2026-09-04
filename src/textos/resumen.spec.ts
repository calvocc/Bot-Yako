import { textos } from './resumen';

describe('resumen.mvp', () => {
  it('incluye la descripción del jugador destacado', () => {
    expect(textos.mvp('Jacob (8 pts — 2 goles, 1 asistencia)')).toBe(
      'MVP del partido: Jacob (8 pts — 2 goles, 1 asistencia)',
    );
  });
});
