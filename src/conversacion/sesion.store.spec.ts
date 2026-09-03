import type { RedisService } from '../core/redis/redis.service';
import type { DbService } from '../db/db.service';
import { SesionStore } from './sesion.store';

const ref = { canal: 'telegram' as const, canalUserId: '1001' };

/**
 * Redis en memoria con la misma semántica que el servicio real: `ejecutar`
 * distingue "el comando corrió" de "Redis falló".
 */
function redisFalso() {
  const datos = new Map<string, string>();
  let roto = false;

  const cliente = {
    get: (k: string) => Promise.resolve(datos.get(k) ?? null),
    set: (k: string, v: string) => {
      if (roto) return Promise.reject(new Error('ECONNRESET'));
      datos.set(k, v);
      return Promise.resolve('OK');
    },
    del: (k: string) => Promise.resolve(datos.delete(k) ? 1 : 0),
  };

  const ejecutar = async (op: (r: typeof cliente) => Promise<unknown>) => {
    try {
      return { ok: true as const, valor: await op(cliente) };
    } catch {
      return { ok: false as const };
    }
  };

  const servicio = {
    disponible: true,
    ejecutar,
    intentar: async (op: (r: typeof cliente) => Promise<unknown>) => {
      const r = await ejecutar(op);
      return r.ok ? r.valor : null;
    },
  };

  return {
    servicio: servicio as unknown as RedisService,
    datos,
    romperEscritura: () => {
      roto = true;
    },
  };
}

/** Postgres en memoria con la forma mínima que usa el store. */
function dbFalsa() {
  const filas = new Map<string, Record<string, unknown>>();
  const clave = (c: string, u: string) => `${c}:${u}`;

  return {
    filas,
    servicio: {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([...filas.values()]),
            }),
          }),
        }),
        insert: () => ({
          values: (v: Record<string, unknown>) => ({
            onConflictDoUpdate: () => {
              filas.clear();
              filas.set(clave(String(v.canal), String(v.canalUserId)), {
                ...v,
                expiraEn: v.expiraEn,
                actualizadoEn: v.actualizadoEn,
              });
              return Promise.resolve();
            },
          }),
        }),
        delete: () => ({
          where: () => {
            filas.clear();
            return Promise.resolve();
          },
        }),
      },
    } as unknown as DbService,
  };
}

describe('SesionStore', () => {
  it('no deja que una caché desactualizada gane sobre Postgres', async () => {
    // Si se escribiera Postgres y después la caché, un fallo al poblarla
    // dejaría el estado viejo mandando durante toda la vigencia de la clave:
    // el flujo del usuario iría hacia atrás.
    const redis = redisFalso();
    const db = dbFalsa();
    const store = new SesionStore(redis.servicio, db.servicio);

    await store.guardar(ref, { flujoId: 'alta', pasoId: 'nombre', datos: {} });
    expect((await store.leer(ref))?.pasoId).toBe('nombre');

    redis.romperEscritura();
    await store.guardar(ref, { flujoId: 'alta', pasoId: 'dorsal', datos: {} });

    // La caché quedó vacía en vez de con el valor viejo, así que la lectura
    // cae a Postgres y devuelve el paso correcto.
    expect(redis.datos.size).toBe(0);
    expect((await store.leer(ref))?.pasoId).toBe('dorsal');
  });

  it('borra la sesión de la caché al cancelar', async () => {
    const redis = redisFalso();
    const db = dbFalsa();
    const store = new SesionStore(redis.servicio, db.servicio);

    await store.guardar(ref, { flujoId: 'alta', pasoId: 'nombre', datos: {} });
    await store.borrar(ref);

    expect(redis.datos.size).toBe(0);
    expect(await store.leer(ref)).toBeNull();
  });
});
