import { validarEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgres://yako:yako@localhost:5432/yako',
  REDIS_URL: 'redis://localhost:6379',
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
};

describe('validarEnv', () => {
  it('aplica los valores por defecto', () => {
    const env = validarEnv({ ...base });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.WHATSAPP_ENABLED).toBe(false);
  });

  it('falla si falta una variable obligatoria', () => {
    expect(() => validarEnv({ ...base, TELEGRAM_BOT_TOKEN: undefined })).toThrow(
      /TELEGRAM_BOT_TOKEN/,
    );
  });

  it('rechaza un secreto de webhook demasiado corto', () => {
    expect(() => validarEnv({ ...base, TELEGRAM_WEBHOOK_SECRET: 'corto' })).toThrow(
      /TELEGRAM_WEBHOOK_SECRET/,
    );
  });

  it('exige la configuracion completa si se enciende WhatsApp', () => {
    expect(() => validarEnv({ ...base, WHATSAPP_ENABLED: 'true' })).toThrow(/WHATSAPP_/);
  });

  it('acepta WhatsApp con la configuracion completa', () => {
    const env = validarEnv({
      ...base,
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_PHONE_NUMBER_ID: '1',
      WHATSAPP_ACCESS_TOKEN: 'token',
      WHATSAPP_VERIFY_TOKEN: 'verify',
      WHATSAPP_APP_SECRET: 'secret',
    });

    expect(env.WHATSAPP_ENABLED).toBe(true);
  });
});
