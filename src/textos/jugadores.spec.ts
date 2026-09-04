import { textos } from './jugadores';

describe('jugadores.ver.encabezado', () => {
  it('incluye el equipo, la cantidad y el cuerpo', () => {
    const texto = textos.ver.encabezado('Sub-11', 3, 'Jacob #10\nAndrés #7');

    expect(texto).toContain('Plantilla de Sub-11 (3):');
    expect(texto).toContain('Jacob #10');
  });
});

describe('jugadores.agregar.agregados', () => {
  it('singular con uno', () => {
    expect(textos.agregar.agregados(1)).toBe('Listo, agregué 1 jugador. ✅');
  });

  it('plural con varios', () => {
    expect(textos.agregar.agregados(3)).toBe('Listo, agregué 3 jugadores. ✅');
  });
});

describe('jugadores.cargarPlantilla', () => {
  it('instrucciones incluye el comando para terminar', () => {
    expect(textos.cargarPlantilla.instrucciones('/listo')).toContain('/listo');
  });

  it('resumenAlta singular y plural', () => {
    expect(textos.cargarPlantilla.resumenAlta(1, '/listo')).toContain('Van 1 jugador.');
    expect(textos.cargarPlantilla.resumenAlta(2, '/listo')).toContain('Van 2 jugadores.');
  });

  it('listaLista sin jugadores avisa que se puede cargar después', () => {
    expect(textos.cargarPlantilla.listaLista(0, 'Siguiente paso')).toContain(
      'Sin jugadores por ahora',
    );
  });

  it('listaLista con jugadores confirma la cantidad', () => {
    const texto = textos.cargarPlantilla.listaLista(2, 'Siguiente paso');

    expect(texto).toContain('Plantilla lista con 2 jugadores. ✅');
    expect(texto).toContain('Siguiente paso');
  });
});
