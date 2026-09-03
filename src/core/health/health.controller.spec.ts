import { Test } from '@nestjs/testing';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const construir = async (postgresOk: boolean, redisOk: boolean) => {
    const modulo = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DbService, useValue: { ping: jest.fn().mockResolvedValue(postgresOk) } },
        { provide: RedisService, useValue: { ping: jest.fn().mockResolvedValue(redisOk) } },
      ],
    }).compile();

    return modulo.get(HealthController);
  };

  it('reporta ok cuando Postgres y Redis responden', async () => {
    const controller = await construir(true, true);

    await expect(controller.check()).resolves.toMatchObject({
      estado: 'ok',
      postgres: 'ok',
      redis: 'ok',
    });
  });

  it('reporta degradado cuando Redis no responde, sin fallar', async () => {
    const controller = await construir(true, false);

    await expect(controller.check()).resolves.toMatchObject({
      estado: 'degradado',
      postgres: 'ok',
      redis: 'caido',
    });
  });
});
