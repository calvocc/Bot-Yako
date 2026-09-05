import { textos } from './pasos-comunes';

describe('pasosComunes.eligeAlMenos', () => {
  it('singular con uno', () => {
    expect(textos.eligeAlMenos(1)).toBe('Elige al menos uno.');
  });

  it('plural con varios', () => {
    expect(textos.eligeAlMenos(3)).toBe('Elige al menos 3.');
  });
});

describe('pasosComunes.marcaSeleccionado', () => {
  it('antepone el check al texto', () => {
    expect(textos.marcaSeleccionado('Jacob')).toBe('✅ Jacob');
  });
});

/**
 * Estos tres se componen desde `comunes.ts` (finding: eran redacciones
 * duplicadas y vivas por separado). Fijar su contenido acá protege esa
 * composición de un futuro cambio que rompa la interpolación en silencio.
 */
describe('pasosComunes.selectorEquipo', () => {
  it('sinEquipos deriva de comunes.sinEquipos y agrega el CTA de /start', () => {
    expect(textos.selectorEquipo.sinEquipos).toBe(
      'Todavía no perteneces a ningún equipo. Usa /start para crear tu academia o entrar con un código.',
    );
  });

  it('sinEquiposAdmin deriva de comunes.soloAdmin', () => {
    expect(textos.selectorEquipo.sinEquiposAdmin).toBe(
      '🔒 Solo un administrador puede hacer esto. No eres admin de ningún equipo.',
    );
  });

  it('sinEquiposEditor deriva de comunes.sinPermisoPara', () => {
    expect(textos.selectorEquipo.sinEquiposEditor).toBe(
      '🔒 No tienes permiso para cargar en ningún equipo. Pídele al admin que te dé rol de Editor.',
    );
  });
});
