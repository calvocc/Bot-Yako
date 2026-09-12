import { comandosParaUsuario } from './comandos';

/** Comandos reales del catálogo, elegidos por su `rolMinimo`. */
const REGISTRADOS = ['ayuda', 'stats', 'nuevopartido', 'permisos'];

describe('comandosParaUsuario', () => {
  it('sin equipos, solo deja lo que es "cualquiera"', () => {
    const nombres = comandosParaUsuario(REGISTRADOS, []).map((c) => c.nombre);

    expect(nombres).toEqual(['ayuda']);
  });

  it('un Viewer ve lo suyo y lo de "cualquiera", pero no lo de Editor ni Admin', () => {
    const nombres = comandosParaUsuario(REGISTRADOS, [{ rol: 'viewer' }]).map((c) => c.nombre);

    expect(nombres).toEqual(['ayuda', 'stats']);
  });

  it('un Editor suma lo de Editor, pero sigue sin lo de Admin', () => {
    const nombres = comandosParaUsuario(REGISTRADOS, [{ rol: 'editor' }]).map((c) => c.nombre);

    // El orden es el del catálogo (`COMANDOS`), no el de `REGISTRADOS`.
    expect(nombres).toEqual(['ayuda', 'nuevopartido', 'stats']);
  });

  it('un Admin ve el catálogo completo de los registrados', () => {
    const nombres = comandosParaUsuario(REGISTRADOS, [{ rol: 'admin' }]).map((c) => c.nombre);

    expect(nombres).toEqual(['ayuda', 'permisos', 'nuevopartido', 'stats']);
  });

  it('alcanza con ser Editor en UN equipo, aunque en otro sea Viewer', () => {
    const nombres = comandosParaUsuario(REGISTRADOS, [{ rol: 'viewer' }, { rol: 'editor' }]).map(
      (c) => c.nombre,
    );

    expect(nombres).toContain('nuevopartido');
  });

  it('nunca ofrece un comando que el router no tiene registrado, aunque el rol alcance', () => {
    const nombres = comandosParaUsuario(['ayuda'], [{ rol: 'admin' }]).map((c) => c.nombre);

    expect(nombres).toEqual(['ayuda']);
  });
});
