import { textos } from './router';

describe('router.comandoDesconocido', () => {
  it('incluye el nombre del comando', () => {
    expect(textos.comandoDesconocido('xyz')).toBe('🤔 No conozco el comando /xyz.');
  });
});

describe('router.ayuda.etiquetaRol', () => {
  it('cubre los cuatro roles con la etiqueta correcta', () => {
    expect(textos.ayuda.etiquetaRol.cualquiera).toBe('');
    expect(textos.ayuda.etiquetaRol.viewer).toBe('');
    expect(textos.ayuda.etiquetaRol.editor).toBe(' · Editor');
    expect(textos.ayuda.etiquetaRol.admin).toBe(' · Admin');
  });
});
