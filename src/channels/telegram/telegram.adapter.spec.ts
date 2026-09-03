import type { TypedConfigService } from '../../config/config.service';
import { TelegramAdapter } from './telegram.adapter';

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
});
