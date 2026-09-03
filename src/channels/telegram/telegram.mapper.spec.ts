import type { Update } from 'telegraf/types';
import { mapearUpdate } from './telegram.mapper';

const remitente = { id: 1001, is_bot: false, first_name: 'Carlos', last_name: 'Pérez' };
const chat = { id: 1001, type: 'private' as const, first_name: 'Carlos' };

describe('mapearUpdate', () => {
  it('mapea un mensaje de texto', () => {
    const update = {
      update_id: 1,
      message: { message_id: 7, date: 1_770_000_000, chat, from: remitente, text: '/ayuda' },
    } as Update;

    expect(mapearUpdate(update)).toMatchObject({
      canal: 'telegram',
      canalUserId: '1001',
      chatId: '1001',
      nombre: 'Carlos Pérez',
      texto: '/ayuda',
    });
  });

  it('mapea el toque de un botón, con el id para acusar recibo', () => {
    const update = {
      update_id: 2,
      callback_query: {
        id: 'cb-1',
        from: remitente,
        chat_instance: 'x',
        data: 'ev:gol',
        message: { message_id: 9, date: 1_770_000_000, chat },
      },
    } as Update;

    expect(mapearUpdate(update)).toMatchObject({
      seleccionId: 'ev:gol',
      mensajeOrigenId: '9',
      acuseId: 'cb-1',
    });
  });

  it('ignora lo que el bot no maneja', () => {
    const edicion = {
      update_id: 3,
      edited_message: { message_id: 7, date: 1, chat, from: remitente, text: 'ya no' },
    } as Update;

    expect(mapearUpdate(edicion)).toBeNull();
  });

  it('ignora mensajes sin texto, como una foto', () => {
    const foto = {
      update_id: 4,
      message: { message_id: 8, date: 1, chat, from: remitente, photo: [] },
    } as unknown as Update;

    expect(mapearUpdate(foto)).toBeNull();
  });
});
