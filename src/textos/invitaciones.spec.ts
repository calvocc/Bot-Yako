import { textos } from './invitaciones';

describe('invitaciones.invitar.codigoGenerado', () => {
  it('incluye el equipo, el rol, la vigencia y el código', () => {
    const texto = textos.invitar.codigoGenerado({
      equipo: 'Sub-11',
      rol: 'Editor',
      dias: 7,
      etiquetaUsos: '1 uso',
      codigo: 'YAKO-X7F2A',
    });

    expect(texto).toContain('Código para *Sub-11* — Editor');
    expect(texto).toContain('Válido 7 días · 1 uso');
    expect(texto).toContain('YAKO-X7F2A');
    expect(texto).not.toContain('comparte este enlace');
  });

  it('agrega el enlace cuando lo hay', () => {
    const texto = textos.invitar.codigoGenerado({
      equipo: 'Sub-11',
      rol: 'Viewer',
      dias: 30,
      etiquetaUsos: 'todo el grupo',
      codigo: 'YAKO-X7F2A',
      enlace: 'https://t.me/YakoBot?start=inv_x7f2a',
    });

    expect(texto).toContain('comparte este enlace:');
    expect(texto).toContain('https://t.me/YakoBot?start=inv_x7f2a');
  });
});

describe('invitaciones.canje', () => {
  it('ok incluye el rol y el equipo', () => {
    expect(textos.canje.ok('Editor', 'Sub-11')).toContain('Editor');
    expect(textos.canje.ok('Editor', 'Sub-11')).toContain('"Sub-11"');
  });

  it('yaEraMiembro incluye el rol y el equipo', () => {
    const texto = textos.canje.yaEraMiembro('Admin', 'Sub-11');

    expect(texto).toContain('Ya eras Admin en "Sub-11"');
  });
});
