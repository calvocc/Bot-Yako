import { Injectable, Logger } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import type { ReferenciaCanal } from '../channels/channel.types';
import { claveReferencia } from '../channels/channel.types';
import { RedisService } from '../core/redis/redis.service';
import { DbService } from '../db/db.service';
import { sesionesConversacion } from '../db/schema';
import type { EstadoSesion } from './flow.types';

/** Cuánto sobrevive una conversación sin actividad antes de darse por perdida. */
export const TTL_SESION_SEGUNDOS = 60 * 60;

/**
 * Estado conversacional, con Redis de caché y Postgres como respaldo durable.
 *
 * Se escribe siempre en Postgres y, si está disponible, también en Redis. Las
 * lecturas van primero a Redis, que es el camino caliente de cada botón durante
 * un partido en vivo.
 *
 * El volumen de escritura es despreciable (unos pocos cientos de pasos por
 * partido), así que la durabilidad sale prácticamente gratis y a cambio una
 * caída de Redis no le hace perder a nadie un flujo a medio completar.
 */
@Injectable()
export class SesionStore {
  private readonly logger = new Logger(SesionStore.name);

  constructor(
    private readonly redis: RedisService,
    private readonly db: DbService,
  ) {}

  private clave(ref: ReferenciaCanal): string {
    return `sesion:${claveReferencia(ref)}`;
  }

  async leer(ref: ReferenciaCanal): Promise<EstadoSesion | null> {
    const enCache = await this.redis.intentar((redis) => redis.get(this.clave(ref)));

    if (enCache) {
      try {
        return JSON.parse(enCache) as EstadoSesion;
      } catch {
        // Un valor corrupto en caché no debe tumbar la conversación:
        // se ignora y se resuelve contra Postgres.
        this.logger.warn(`Sesión ilegible en caché para ${claveReferencia(ref)}`);
      }
    }

    const [fila] = await this.db.db
      .select()
      .from(sesionesConversacion)
      .where(
        and(
          eq(sesionesConversacion.canal, ref.canal),
          eq(sesionesConversacion.canalUserId, ref.canalUserId),
        ),
      )
      .limit(1);

    if (!fila || fila.expiraEn.getTime() <= Date.now()) {
      return null;
    }

    return {
      flujoId: fila.flujoId,
      pasoId: fila.pasoId,
      datos: fila.datos as EstadoSesion['datos'],
      actualizadoEn: fila.actualizadoEn.toISOString(),
    };
  }

  /**
   * Escribe el estado con el patrón invalidar → escribir → poblar.
   *
   * El orden importa: si se escribiera Postgres y luego la caché, un fallo al
   * poblarla (con Redis arriba) dejaría el valor viejo mandando durante toda
   * la vigencia de la clave, y el flujo del usuario retrocedería. Invalidando
   * primero, el peor caso es una caché vacía y una lectura que cae a Postgres,
   * que siempre tiene el estado correcto.
   */
  async guardar(ref: ReferenciaCanal, estado: Omit<EstadoSesion, 'actualizadoEn'>): Promise<void> {
    const ahora = new Date();
    const completo: EstadoSesion = { ...estado, actualizadoEn: ahora.toISOString() };
    const expiraEn = new Date(ahora.getTime() + TTL_SESION_SEGUNDOS * 1000);

    await this.invalidarCache(ref);

    await this.db.db
      .insert(sesionesConversacion)
      .values({
        canal: ref.canal,
        canalUserId: ref.canalUserId,
        flujoId: completo.flujoId,
        pasoId: completo.pasoId,
        datos: completo.datos,
        expiraEn,
        actualizadoEn: ahora,
      })
      .onConflictDoUpdate({
        target: [sesionesConversacion.canal, sesionesConversacion.canalUserId],
        set: {
          flujoId: completo.flujoId,
          pasoId: completo.pasoId,
          datos: completo.datos,
          expiraEn,
          actualizadoEn: ahora,
        },
      });

    const poblada = await this.redis.ejecutar((redis) =>
      redis.set(this.clave(ref), JSON.stringify(completo), 'EX', TTL_SESION_SEGUNDOS),
    );

    if (!poblada.ok) {
      // Sin caché las lecturas van a Postgres: más lento, pero correcto.
      this.logger.debug(`No se pudo poblar la caché de ${claveReferencia(ref)}`);
    }
  }

  async borrar(ref: ReferenciaCanal): Promise<void> {
    // También aquí primero la caché: si el borrado en Redis fallara después de
    // borrar en Postgres, la sesión seguiría viva en caché y `/cancelar`
    // dejaría al usuario atrapado en el flujo que acaba de cancelar.
    await this.invalidarCache(ref);

    await this.db.db
      .delete(sesionesConversacion)
      .where(
        and(
          eq(sesionesConversacion.canal, ref.canal),
          eq(sesionesConversacion.canalUserId, ref.canalUserId),
        ),
      );

    await this.invalidarCache(ref);
  }

  /**
   * Quita la clave de la caché. Si Redis no responde, tampoco responderá a las
   * lecturas, así que estas caerán a Postgres igual.
   */
  private async invalidarCache(ref: ReferenciaCanal): Promise<void> {
    await this.redis.intentar((redis) => redis.del(this.clave(ref)));
  }

  /** Borra sesiones vencidas. Pensado para una tarea periódica. */
  async limpiarVencidas(): Promise<number> {
    const borradas = await this.db.db
      .delete(sesionesConversacion)
      .where(lt(sesionesConversacion.expiraEn, new Date()))
      .returning({ canal: sesionesConversacion.canal });

    return borradas.length;
  }
}
