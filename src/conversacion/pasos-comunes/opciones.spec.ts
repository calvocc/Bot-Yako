import { botonesDeOpciones } from './opciones';

const opciones = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i}`, texto: `Opción ${i}` }));

describe('botonesDeOpciones', () => {
  it('muestra la lista completa, sin paginar', () => {
    const botones = botonesDeOpciones(opciones(25));

    expect(botones).toHaveLength(25);
    expect(botones.at(-1)?.id).toBe('o24');
  });

  it('recorta los rótulos largos', () => {
    const [boton] = botonesDeOpciones([
      { id: 'x', texto: 'Un nombre larguísimo que no entra en un botón' },
    ]);

    expect(boton.texto.length).toBeLessThanOrEqual(20);
    expect(boton.id).toBe('x');
  });
});
