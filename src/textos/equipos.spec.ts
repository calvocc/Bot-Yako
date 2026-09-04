import { textos } from './equipos';

describe('equipos.soloAdmins', () => {
  it('reusa el texto base de comunes.soloAdmin', () => {
    const texto = textos.soloAdmins();

    expect(texto).toContain('🔒 Solo un administrador puede crear equipos.');
    expect(texto).toContain('No eres admin de ninguna academia.');
  });
});

describe('equipos.nombreRepetido', () => {
  it('incluye el nombre repetido', () => {
    expect(textos.nombreRepetido('Sub-11')).toBe(
      'Ya existe un equipo llamado "Sub-11". Elige otro nombre:',
    );
  });
});

describe('equipos.listado', () => {
  it('incluye las líneas de equipos', () => {
    expect(textos.listado('- Sub-11\n- Sub-13')).toContain('- Sub-11\n- Sub-13');
  });
});
