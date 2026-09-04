import type { TypedConfigService } from '../../config/config.service';
import { RedisService } from './redis.service';

/**
 * `lazyConnect` hace que el cliente no abra la conexión al construirse, así que
 * se pueden emitir sus eventos a mano y observar cómo reacciona el servicio.
 */
function construir(): { servicio: RedisService; emitir: (evento: string) => void } {
  const config = { get: () => 'redis://localhost:6379' } as unknown as TypedConfigService;
  const servicio = new RedisService(config);
  const cliente = servicio.raw as unknown as { emit: (evento: string) => boolean };

  return { servicio, emitir: (evento) => void cliente.emit(evento) };
}

describe('RedisService', () => {
  let servicio: RedisService;
  let emitir: (evento: string) => void;

  beforeEach(() => {
    ({ servicio, emitir } = construir());
  });

  afterEach(() => servicio.raw.disconnect());

  const marcarConectado = () => {
    (servicio as unknown as { conectado: boolean }).conectado = true;
  };

  it('distingue "no hay Redis" de "Redis no responde"', () => {
    // `/health` necesita esta diferencia: sin ella, no haber configurado Redis
    // —que es una decisión, no una avería— se reporta igual que una caída.
    expect(servicio.configurado).toBe(true);

    const sinUrl = new RedisService({ get: () => undefined } as unknown as TypedConfigService);

    expect(sinUrl.configurado).toBe(false);
    expect(sinUrl.disponible).toBe(false);
  });

  it('queda no disponible cuando la conexión se cierra', () => {
    emitir('ready');
    expect(servicio.disponible).toBe(true);

    // Un cierre limpio del servidor emite 'close', no 'error' ni 'end'. Con
    // enableOfflineQueue apagado, no escucharlo dejaría `disponible` en true
    // mientras todos los comandos rechazan.
    emitir('close');
    expect(servicio.disponible).toBe(false);
  });

  it('queda no disponible ante un error de conexión', () => {
    emitir('ready');
    servicio.raw.emit('error', new Error('ECONNREFUSED'));

    expect(servicio.disponible).toBe(false);
  });

  it('distingue un valor nulo de un fallo de Redis', async () => {
    marcarConectado();

    // Es la distinción que sostiene el dedup de reentregas: con `SET NX`,
    // null significa "ya existía", y confundirlo con un error descartaría
    // un mensaje legítimo del usuario.
    await expect(servicio.ejecutar(() => Promise.resolve(null))).resolves.toEqual({
      ok: true,
      valor: null,
    });

    await expect(servicio.ejecutar(() => Promise.reject(new Error('ECONNRESET')))).resolves.toEqual(
      {
        ok: false,
      },
    );
  });

  it('reporta no-ok cuando no hay conexión', async () => {
    await expect(servicio.ejecutar(() => Promise.resolve('x'))).resolves.toEqual({ ok: false });
  });

  it('intentar aplana ambos desenlaces a null', async () => {
    marcarConectado();

    await expect(servicio.intentar(() => Promise.resolve('valor'))).resolves.toBe('valor');
    await expect(servicio.intentar(() => Promise.reject(new Error('x')))).resolves.toBeNull();
  });
});
