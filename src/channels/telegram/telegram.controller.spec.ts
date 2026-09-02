import { UnauthorizedException } from '@nestjs/common';
import type { Update } from 'telegraf/types';
import type { TypedConfigService } from '../../config/config.service';
import type { ProcesadorMensajes } from '../procesador-mensajes.service';
import { TelegramController } from './telegram.controller';

const SECRETO = '0123456789abcdef0123456789abcdef';

const updateDeTexto = {
  update_id: 1,
  message: {
    message_id: 7,
    date: 1_770_000_000,
    chat: { id: 1001, type: 'private' as const, first_name: 'Carlos' },
    from: { id: 1001, is_bot: false, first_name: 'Carlos' },
    text: '/ayuda',
  },
} as Update;

describe('TelegramController', () => {
  let procesar: jest.Mock;
  let controller: TelegramController;

  beforeEach(() => {
    procesar = jest.fn().mockResolvedValue(undefined);

    controller = new TelegramController(
      { get: () => SECRETO } as unknown as TypedConfigService,
      { procesar } as unknown as ProcesadorMensajes,
    );
  });

  it('procesa el update cuando el secreto coincide', () => {
    expect(controller.recibir(updateDeTexto, SECRETO)).toEqual({ ok: true });
    expect(procesar).toHaveBeenCalledTimes(1);
  });

  it('rechaza un update sin secreto', () => {
    // Sin esto el endpoint queda abierto: cualquiera podría cargar goles
    // haciéndose pasar por otro papá.
    expect(() => controller.recibir(updateDeTexto)).toThrow(UnauthorizedException);
    expect(procesar).not.toHaveBeenCalled();
  });

  it('rechaza un secreto incorrecto', () => {
    expect(() => controller.recibir(updateDeTexto, 'a'.repeat(SECRETO.length))).toThrow(
      UnauthorizedException,
    );
    expect(procesar).not.toHaveBeenCalled();
  });

  it('rechaza un secreto de largo distinto sin romperse', () => {
    // timingSafeEqual lanza si los buffers difieren en largo; el chequeo
    // previo tiene que evitarlo.
    expect(() => controller.recibir(updateDeTexto, 'corto')).toThrow(UnauthorizedException);
  });

  it('acepta un update que no sabe manejar sin llamar al procesador', () => {
    const edicion = { update_id: 2, poll: { id: 'p' } } as unknown as Update;

    expect(controller.recibir(edicion, SECRETO)).toEqual({ ok: true });
    expect(procesar).not.toHaveBeenCalled();
  });
});
