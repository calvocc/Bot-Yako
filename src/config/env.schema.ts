import { z } from 'zod';

const booleanoDesdeTexto = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
    DATABASE_MIGRATION_URL: z.string().optional(),

    /**
     * Opcional a propósito. Redis acelera el partido en vivo pero no es fuente
     * de verdad: sin él, el bot arranca igual y `/health` reporta `degradado`.
     * Exigirlo impediría desplegar antes de tener el Redis listo, sin ninguna
     * ganancia de seguridad.
     */
    REDIS_URL: z.string().min(1).optional(),

    TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN es obligatorio'),
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .min(16, 'TELEGRAM_WEBHOOK_SECRET debe tener al menos 16 caracteres')
      .max(256),
    TELEGRAM_WEBHOOK_URL: z.string().url().optional(),

    WHATSAPP_ENABLED: booleanoDesdeTexto,
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
  })
  // Si alguien enciende WhatsApp, exigimos la config completa en el arranque
  // en vez de fallar en el primer mensaje entrante.
  .refine(
    (env) =>
      !env.WHATSAPP_ENABLED ||
      Boolean(
        env.WHATSAPP_PHONE_NUMBER_ID &&
        env.WHATSAPP_ACCESS_TOKEN &&
        env.WHATSAPP_VERIFY_TOKEN &&
        env.WHATSAPP_APP_SECRET,
      ),
    {
      message:
        'WHATSAPP_ENABLED=true requiere WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN y WHATSAPP_APP_SECRET',
      path: ['WHATSAPP_ENABLED'],
    },
  );

export type Env = z.infer<typeof envSchema>;

/**
 * Valida el entorno al arrancar. Preferimos que el proceso no levante a que
 * descubra una variable faltante en medio de un partido.
 *
 * Antes de validar se descartan las claves con cadena vacía: dotenv convierte
 * una línea `CLAVE=` en `''`, y `''` no pasa `.url()` ni `.min(1)`. Sin esto,
 * copiar `.env.example` —que trae varias así— impediría arrancar, cuando la
 * intención evidente de esa línea es "no configurada".
 */
export function validarEnv(config: Record<string, unknown>): Env {
  const sinVacias = Object.fromEntries(Object.entries(config).filter(([, valor]) => valor !== ''));

  const resultado = envSchema.safeParse(sinVacias);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuracion de entorno invalida:\n${detalle}`);
  }

  return resultado.data;
}
