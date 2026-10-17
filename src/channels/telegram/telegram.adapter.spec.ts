import type { TypedConfigService } from '../../config/config.service';
import { partirTexto, TelegramAdapter } from './telegram.adapter';

const config = { get: () => '123456:token-de-prueba' } as unknown as TypedConfigService;
const destino = { canal: 'telegram' as const, chatId: '1001' };

function construir() {
  const adaptador = new TelegramAdapter(config);
  const telegram = adaptador.telegraf.telegram;

  return {
    adaptador,
    editar: jest.spyOn(telegram, 'editMessageText'),
    enviar: jest
      .spyOn(telegram, 'sendMessage')
      .mockResolvedValue({ message_id: 99 } as unknown as never),
  };
}

describe('TelegramAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('edita el mensaje en el sitio cuando se le indica', async () => {
    const { adaptador, editar, enviar } = construir();
    editar.mockResolvedValue(true);

    const res = await adaptador.enviar(destino, { texto: 'min 12', editarMensajeId: '7' });

    expect(res.mensajeId).toBe('7');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('no reenvía el panel cuando el contenido no cambió', async () => {
    // Telegram responde 400 "message is not modified" si la edición no cambia
    // nada. Eso no es un fallo: el mensaje ya dice lo que queríamos. Mandar uno
    // nuevo duplicaría el panel del partido en vivo, justo lo que la edición en
    // el sitio existe para evitar.
    const { adaptador, editar, enviar } = construir();
    editar.mockRejectedValue(
      new Error('400: Bad Request: message is not modified: specified new message content...'),
    );

    const res = await adaptador.enviar(destino, { texto: 'min 12', editarMensajeId: '7' });

    expect(enviar).not.toHaveBeenCalled();
    expect(res.mensajeId).toBe('7');
  });

  it('manda un mensaje nuevo si el original ya no se puede editar', async () => {
    const { adaptador, editar, enviar } = construir();
    editar.mockRejectedValue(new Error('400: Bad Request: message to edit not found'));

    const res = await adaptador.enviar(destino, { texto: 'min 12', editarMensajeId: '7' });

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(res.mensajeId).toBe('99');
  });

  it('rechaza un id de botón que Telegram truncaría', async () => {
    const { adaptador } = construir();

    await expect(
      adaptador.enviar(destino, { texto: 'x', botones: [{ id: 'a'.repeat(65), texto: 'Largo' }] }),
    ).rejects.toThrow(/64/);
  });

  it('parte un texto más largo que el límite y deja los botones en el último', async () => {
    const { adaptador, editar, enviar } = construir();
    const linea = 'x'.repeat(100);
    const texto = Array.from({ length: 60 }, () => linea).join('\n');

    await adaptador.enviar(destino, {
      texto,
      botones: [{ id: 'b', texto: 'Uno' }],
      editarMensajeId: '7',
    });

    // No entra en un mensaje: no se intenta editar, se manda en dos.
    expect(editar).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls[0][2]).toBeUndefined();
    expect(enviar.mock.calls[1][2]).toEqual({
      reply_markup: { inline_keyboard: [[{ text: 'Uno', callback_data: 'b' }]] },
    });
  });
});

describe('partirTexto', () => {
  it('deja intacto un texto que entra', () => {
    expect(partirTexto('hola\nchau', 20)).toEqual(['hola\nchau']);
  });

  it('corta entre líneas sin perder ninguna', () => {
    const trozos = partirTexto('aaaa\nbbbb\ncccc', 9);

    expect(trozos).toEqual(['aaaa\nbbbb', 'cccc']);
    expect(trozos.join('\n')).toBe('aaaa\nbbbb\ncccc');
  });

  it('corta a la fuerza solo una línea que no entra sola', () => {
    expect(partirTexto('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});
