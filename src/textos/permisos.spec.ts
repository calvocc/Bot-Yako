import { textos } from './permisos';

describe('permisos.soloElUsuario', () => {
  it('incluye el nombre del equipo', () => {
    expect(textos.soloElUsuario('Sub-11')).toContain('En Sub-11 todavía no hay nadie más.');
  });
});

describe('permisos.preguntaRol', () => {
  it('incluye el nombre de la persona', () => {
    expect(textos.preguntaRol('Jacob')).toBe('¿Qué rol le doy a Jacob?');
  });
});

describe('permisos.unicoAdmin', () => {
  it('incluye el nombre y el equipo', () => {
    const texto = textos.unicoAdmin('Jacob', 'Sub-11');

    expect(texto).toContain('Jacob es el único admin de Sub-11.');
  });
});

describe('permisos.rolCambiado', () => {
  it('incluye el nombre, el rol nuevo y el equipo', () => {
    const texto = textos.rolCambiado('Jacob', 'Editor', 'Sub-11');

    expect(texto).toBe('Listo: Jacob ahora es Editor en Sub-11 ✅');
  });
});
