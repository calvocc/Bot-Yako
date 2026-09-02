import type { RespuestaBot } from '../channel.types';
import { MAX_FILAS_LISTA, renderizarParaWhatsApp } from './whatsapp.render';

const botones = (cantidad: number) =>
  Array.from({ length: cantidad }, (_, i) => ({ id: `b${i}`, texto: `Opción ${i}` }));

describe('renderizarParaWhatsApp', () => {
  it('manda texto plano cuando no hay botones', () => {
    expect(renderizarParaWhatsApp({ texto: 'Hola' })).toEqual({ tipo: 'texto', cuerpo: 'Hola' });
  });

  it('usa botones de respuesta rápida hasta tres opciones', () => {
    const resultado = renderizarParaWhatsApp({ texto: '¿Cuál?', botones: botones(3) });

    expect(resultado.tipo).toBe('botones');
  });

  it('convierte a lista automáticamente a partir de cuatro opciones', () => {
    const resultado = renderizarParaWhatsApp({ texto: '¿Cuál?', botones: botones(4) });

    expect(resultado.tipo).toBe('lista');
  });

  it('convierte el panel del partido en vivo, que tiene ocho botones', () => {
    // Es el caso que motiva la conversión automática: en Telegram se muestran
    // los ocho, y en WhatsApp el mismo flujo sigue funcionando como lista.
    const panel: RespuestaBot = {
      texto: 'Tiempo 1 · min 12 · 1-0',
      botones: [
        { id: 'ev:gol', texto: '⚽ Gol' },
        { id: 'ev:asis', texto: '🅰️ Asistencia' },
        { id: 'ev:amar', texto: '🟨 Tarjeta' },
        { id: 'ev:roja', texto: '🟥 Roja' },
        { id: 'ev:cambio', texto: '🔄 Cambio' },
        { id: 'ti:fin', texto: '⏸️ Finalizar tiempo' },
        { id: 'pa:resumen', texto: '📋 Ver resumen' },
        { id: 'pa:fin', texto: '🏁 Finalizar partido' },
      ],
    };

    const resultado = renderizarParaWhatsApp(panel);

    expect(resultado.tipo).toBe('lista');

    if (resultado.tipo !== 'lista') throw new Error('esperaba lista');

    expect(resultado.filas).toHaveLength(8);
    // Los ids tienen que sobrevivir intactos: son lo que el flujo interpreta.
    expect(resultado.filas.map((f) => f.id)).toEqual(panel.botones?.map((b) => b.id));
  });

  it('recorta los rótulos que exceden el límite de la plataforma', () => {
    const resultado = renderizarParaWhatsApp({
      texto: '¿Cuál?',
      botones: [{ id: 'x', texto: 'Un rótulo larguísimo que no entra en un botón' }],
    });

    if (resultado.tipo !== 'botones') throw new Error('esperaba botones');

    expect(resultado.botones[0].titulo.length).toBeLessThanOrEqual(20);
    expect(resultado.botones[0].id).toBe('x');
  });

  it('falla si un flujo ofrece más opciones de las que WhatsApp puede mostrar', () => {
    // Preferimos un error explícito a esconder opciones en silencio: es el
    // flujo el que tiene que paginar.
    expect(() =>
      renderizarParaWhatsApp({ texto: '¿Cuál?', botones: botones(MAX_FILAS_LISTA + 1) }),
    ).toThrow(/paginar/);
  });
});
