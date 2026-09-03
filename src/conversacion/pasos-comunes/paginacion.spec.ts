import { botonesPaginados, ID_VER_MAS, OPCIONES_POR_PAGINA, paginaSiguiente } from './paginacion';

const opciones = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i}`, texto: `Opción ${i}` }));

describe('botonesPaginados', () => {
  it('no agrega "Ver más" si todo entra en una página', () => {
    const { botones, hayMas } = botonesPaginados(opciones(OPCIONES_POR_PAGINA), 0);

    expect(hayMas).toBe(false);
    expect(botones).toHaveLength(OPCIONES_POR_PAGINA);
    expect(botones.some((b) => b.id === ID_VER_MAS)).toBe(false);
  });

  it('deja llegar a la última opción de una lista larga', () => {
    // Recortar sin más dejaba a la doceava persona permanentemente
    // inalcanzable: no se le podía ni cambiar el rol ni dar de baja.
    const todas = opciones(12);

    const primera = botonesPaginados(todas, 0);
    expect(primera.hayMas).toBe(true);
    expect(primera.botones.at(-1)?.id).toBe(ID_VER_MAS);

    const segunda = botonesPaginados(todas, 1);
    expect(segunda.hayMas).toBe(false);
    expect(segunda.botones.map((b) => b.id)).toContain('o11');
  });

  it('vuelve a la primera página al pasarse', () => {
    expect(paginaSiguiente(0, 12)).toBe(1);
    expect(paginaSiguiente(1, 12)).toBe(0);
  });

  it('recorta los rótulos al límite de WhatsApp', () => {
    const { botones } = botonesPaginados(
      [{ id: 'x', texto: 'Un nombre larguísimo que no entra en un botón' }],
      0,
    );

    expect(botones[0].texto.length).toBeLessThanOrEqual(20);
    expect(botones[0].id).toBe('x');
  });
});
