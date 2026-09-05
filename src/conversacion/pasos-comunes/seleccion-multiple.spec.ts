import { seleccionDePrueba, textoDePrueba } from '../../channels/testing/fake.adapter';
import type { ContextoFlujo, DatosFlujo, Paso } from '../flow.types';
import { pasoSeleccionMultiple } from './seleccion-multiple';

const OPCIONES = [
  { id: 'jg:jacob', texto: 'Jacob #10' },
  { id: 'jg:andres', texto: 'Andrés #7' },
];

const construir = (opciones: Partial<Parameters<typeof pasoSeleccionMultiple>[1]> = {}): Paso =>
  pasoSeleccionMultiple('titulares', {
    pregunta: '¿Quiénes arrancan?',
    obtenerOpciones: () => Promise.resolve(OPCIONES),
    alConfirmar: (_ctx, elegidos) =>
      Promise.resolve({ tipo: 'finalizar', respuesta: { texto: `Listo: ${elegidos.join(',')}` } }),
    ...opciones,
  });

const contexto = (parcial: Partial<ContextoFlujo> = {}, datos: DatosFlujo = {}): ContextoFlujo => ({
  mensaje: textoDePrueba(''),
  datos,
  usuarioId: 'u1',
  ...parcial,
});

describe('pasoSeleccionMultiple', () => {
  it('muestra las opciones sin nada marcado y el conteo en cero', async () => {
    const paso = construir();
    const entrada = await paso.entrar(contexto());

    if (!('respuesta' in entrada)) throw new Error('esperaba una respuesta');

    expect(entrada.respuesta.botones?.map((b) => b.texto)).toEqual([
      'Jacob #10',
      'Andrés #7',
      '✅ Todos',
      'Ninguno',
      'Listo (0)',
    ]);
  });

  it('tocar una opción la marca, y tocarla de nuevo la desmarca', async () => {
    const paso = construir();

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const uno = await paso.recibir(contexto({ mensaje: seleccionDePrueba('jg:jacob') }));

    if (uno.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(uno.respuesta.botones?.find((b) => b.id === 'jg:jacob')?.texto).toBe('✅ Jacob #10');
    expect(uno.respuesta.botones?.find((b) => b.id === 'sm:listo')?.texto).toBe('Listo (1)');

    const datos = { seleccionMultiple: ['jg:jacob'] };
    const dos = await paso.recibir(contexto({ mensaje: seleccionDePrueba('jg:jacob') }, datos));

    if (dos.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(dos.respuesta.botones?.find((b) => b.id === 'jg:jacob')?.texto).toBe('Jacob #10');
  });

  it('confirmar sin elegir nada no avanza, con el mínimo por defecto', async () => {
    const paso = construir();

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const resultado = await paso.recibir(contexto({ mensaje: seleccionDePrueba('sm:listo') }));

    expect(resultado.tipo).toBe('repetir');
    if (resultado.tipo === 'repetir') {
      expect(resultado.respuesta.texto).toContain('Elige al menos uno');
    }
  });

  it('confirmar con lo mínimo llama a alConfirmar con los ids elegidos', async () => {
    const paso = construir();

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const datos = { seleccionMultiple: ['jg:jacob', 'jg:andres'] };
    const resultado = await paso.recibir(
      contexto({ mensaje: seleccionDePrueba('sm:listo') }, datos),
    );

    expect(resultado).toMatchObject({
      tipo: 'finalizar',
      respuesta: { texto: 'Listo: jg:jacob,jg:andres' },
    });
  });

  it('sin opciones, termina de una con el aviso configurado', async () => {
    const paso = construir({
      obtenerOpciones: () => Promise.resolve([]),
      sinOpciones: 'No hay nadie en la plantilla.',
    });

    const entrada = await paso.entrar(contexto());

    expect(entrada).toMatchObject({
      transicion: { tipo: 'finalizar', respuesta: { texto: 'No hay nadie en la plantilla.' } },
    });
  });

  it('cada toque edita el mensaje que traía el botón, no manda uno nuevo', async () => {
    const paso = construir();

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const mensaje = seleccionDePrueba('jg:jacob', { mensajeOrigenId: '42' });
    const resultado = await paso.recibir(contexto({ mensaje }));

    if (resultado.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(resultado.respuesta.editarMensajeId).toBe('42');
  });

  it('"Todos" marca la lista completa, "Ninguno" la vacía', async () => {
    const paso = construir();

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const todos = await paso.recibir(contexto({ mensaje: seleccionDePrueba('sm:todos') }));

    if (todos.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(todos.datos).toEqual({ seleccionMultiple: ['jg:jacob', 'jg:andres'] });
    expect(todos.respuesta.botones?.find((b) => b.id === 'sm:listo')?.texto).toBe('Listo (2)');

    const datos = { seleccionMultiple: ['jg:jacob', 'jg:andres'] };
    const ninguno = await paso.recibir(
      contexto({ mensaje: seleccionDePrueba('sm:ninguno') }, datos),
    );

    if (ninguno.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(ninguno.datos).toEqual({ seleccionMultiple: [] });
    expect(ninguno.respuesta.botones?.find((b) => b.id === 'sm:listo')?.texto).toBe('Listo (0)');
  });

  it('el atajo por texto reemplaza la selección con lo que reconoce', async () => {
    const paso = construir({
      interpretarTexto: (_ctx, texto, lista) => ({
        ids: lista
          .filter((o) => texto.toLowerCase().includes(o.texto.split(' #')[0].toLowerCase()))
          .map((o) => o.id),
        sinReconocer: [],
      }),
    });

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const resultado = await paso.recibir(contexto({ mensaje: textoDePrueba('jacob') }));

    if (resultado.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(resultado.datos).toEqual({ seleccionMultiple: ['jg:jacob'] });
  });

  it('el atajo por texto que no reconoce nada repite con el aviso', async () => {
    const paso = construir({
      interpretarTexto: () => null,
      avisoTextoNoReconocido: 'No entendí esos nombres.',
    });

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const resultado = await paso.recibir(contexto({ mensaje: textoDePrueba('quién sabe') }));

    if (resultado.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(resultado.respuesta.texto).toContain('No entendí esos nombres.');
  });

  it('una coincidencia parcial aplica lo reconocido y avisa de lo que no', async () => {
    const paso = construir({
      interpretarTexto: () => Promise.resolve({ ids: ['jg:jacob'], sinReconocer: ['14'] }),
    });

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const resultado = await paso.recibir(contexto({ mensaje: textoDePrueba('10, 14') }));

    if (resultado.tipo !== 'repetir') throw new Error('esperaba repetir');
    // Se aplica la selección reconocida...
    expect(resultado.datos).toEqual({ seleccionMultiple: ['jg:jacob'] });
    // ...y se avisa de lo que no, en vez de aplicarla en silencio.
    expect(resultado.respuesta.texto).toContain('No reconocí: 14');
  });
});
