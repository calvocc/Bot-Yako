import { Test } from '@nestjs/testing';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const construir = async (
    postgresOk: boolean,
    redis: { configurado: boolean; responde?: boolean },
  ) => {
    const modulo = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DbService, useValue: { ping: jest.fn().mockResolvedValue(postgresOk) } },
        {
          provide: RedisService,
          useValue: {
            configurado: redis.configurado,
            ping: jest.fn().mockResolvedValue(redis.responde ?? false),
          },
        },
      ],
    }).compile();

    return modulo.get(HealthController);
  };

  it('reporta ok cuando Postgres y Redis responden', async () => {
    const controller = await construir(true, { configurado: true, responde: true });

    await expect(controller.check()).resolves.toMatchObject({
      estado: 'ok',
      postgres: 'ok',
      redis: 'ok',
    });
  });

  it('sin Redis configurado el servicio está sano, no degradado', async () => {
    // Redis es opcional por diseño: no tenerlo es la configuración elegida, no
    // una avería. Reportarlo como caída convertía el estado normal del servicio
    // en una alarma permanente, y una alarma que suena siempre se ignora justo
    // el día que significa algo.
    const controller = await construir(true, { configurado: false });

    await expect(controller.check()).resolves.toMatchObject({
      estado: 'ok',
      postgres: 'ok',
      redis: 'no_configurado',
    });
  });

  it('reporta degradado cuando había Redis y dejó de responder', async () => {
    const controller = await construir(true, { configurado: true, responde: false });

    await expect(controller.check()).resolves.toMatchObject({
      estado: 'degradado',
      postgres: 'ok',
      redis: 'caido',
    });
  });

  it('no le pregunta a un Redis que no existe', async () => {
    const controller = await construir(true, { configurado: false });
    await controller.check();

    // El PING sería un no-op, pero cada comando contra un Redis gestionado se
    // factura: no vale la pena gastarlo para confirmar lo que ya sabemos.
    const redis = (controller as unknown as { redis: { ping: jest.Mock } }).redis;
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('Postgres caído sí degrada, aunque Redis esté bien', async () => {
    const controller = await construir(false, { configurado: true, responde: true });

    await expect(controller.check()).resolves.toMatchObject({
      estado: 'degradado',
      postgres: 'caido',
      redis: 'ok',
    });
  });
});
