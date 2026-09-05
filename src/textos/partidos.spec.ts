import { textos } from './partidos';

describe('partidos.nuevoPartido.creado', () => {
  it('incluye el detalle y el formato', () => {
    const texto = textos.nuevoPartido.creado('Sub-11 vs Rival — hoy', '2 x 25');

    expect(texto).toContain('Partido creado ✅');
    expect(texto).toContain('Sub-11 vs Rival — hoy');
    expect(texto).toContain('Formato: 2 x 25');
  });
});

describe('partidos.nuevoPartido.preguntaFormato', () => {
  it('incluye el formato habitual del equipo', () => {
    expect(textos.nuevoPartido.preguntaFormato('2 x 25')).toContain('2 x 25');
  });
});

describe('partidos.reabrir.reabierto', () => {
  it('incluye equipo, rival y fecha', () => {
    const texto = textos.reabrir.reabierto('Sub-11', 'Rival FC', '12-10');

    expect(texto).toContain('Partido reabierto ✅ Sub-11 vs Rival FC — 12-10');
    expect(texto).toContain('/cargar');
    expect(texto).toContain('/finalizar');
  });
});
