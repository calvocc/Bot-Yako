import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { MensajeEntrante } from '../channels/channel.types';
import { DbService } from '../db/db.service';
import { identidadesUsuario, usuarios } from '../db/schema';

/**
 * Resuelve quién está escribiendo, sin que el resto del sistema sepa por qué
 * canal llegó.
 *
 * La cuenta se crea al primer mensaje: así cualquier flujo posterior puede dar
 * por hecho que hay un `usuarioId`, y el onboarding solo decide a qué equipos
 * pertenece, no si existe.
 */
/** La identidad ya la creó otro mensaje concurrente del mismo usuario. */
class CarreraDeIdentidad extends Error {
  constructor() {
    super('La identidad fue creada por otra petición simultánea');
  }
}

@Injectable()
export class IdentidadService {
  private readonly logger = new Logger(IdentidadService.name);

  constructor(private readonly db: DbService) {}

  /** Devuelve el id de usuario para este mensaje, creándolo si hace falta. */
  async resolverUsuario(mensaje: MensajeEntrante): Promise<string> {
    const existente = await this.buscarPorIdentidad(mensaje.canal, mensaje.canalUserId);

    if (existente) {
      await this.actualizarChatId(mensaje, existente);
      return existente;
    }

    try {
      return await this.crear(mensaje);
    } catch (error) {
      if (!(error instanceof CarreraDeIdentidad)) throw error;

      // Otro mensaje del mismo usuario nuevo ganó la carrera; su cuenta es la
      // buena. La nuestra ya fue revertida con la transacción.
      const ganador = await this.buscarPorIdentidad(mensaje.canal, mensaje.canalUserId);

      if (!ganador) throw error;

      return ganador;
    }
  }

  private async buscarPorIdentidad(
    canal: MensajeEntrante['canal'],
    canalUserId: string,
  ): Promise<string | null> {
    const [fila] = await this.db.db
      .select({ usuarioId: identidadesUsuario.usuarioId })
      .from(identidadesUsuario)
      .where(
        and(eq(identidadesUsuario.canal, canal), eq(identidadesUsuario.canalUserId, canalUserId)),
      )
      .limit(1);

    return fila?.usuarioId ?? null;
  }

  private async crear(mensaje: MensajeEntrante): Promise<string> {
    return this.db.db.transaction(async (tx) => {
      const [usuario] = await tx
        .insert(usuarios)
        .values({ nombre: mensaje.nombre || 'Sin nombre' })
        .returning({ id: usuarios.id });

      const [identidad] = await tx
        .insert(identidadesUsuario)
        .values({
          usuarioId: usuario.id,
          canal: mensaje.canal,
          canalUserId: mensaje.canalUserId,
          chatId: mensaje.chatId,
        })
        .onConflictDoNothing()
        .returning({ usuarioId: identidadesUsuario.usuarioId });

      // Sin fila devuelta, la identidad ya existía: dos mensajes casi
      // simultáneos de alguien nuevo. Devolver `usuario.id` acá crearía una
      // cuenta que ninguna identidad apunta, y todo lo que el onboarding
      // colgara de ella sería inalcanzable para siempre. Se lanza para que la
      // transacción revierta y el llamador relea al ganador.
      if (!identidad) throw new CarreraDeIdentidad();

      this.logger.log(`Usuario nuevo desde ${mensaje.canal}`);
      return usuario.id;
    });
  }

  /** El chat de destino puede cambiar; se mantiene al día para poder escribirle. */
  private async actualizarChatId(mensaje: MensajeEntrante, usuarioId: string): Promise<void> {
    await this.db.db
      .update(identidadesUsuario)
      .set({ chatId: mensaje.chatId })
      .where(
        and(
          eq(identidadesUsuario.canal, mensaje.canal),
          eq(identidadesUsuario.canalUserId, mensaje.canalUserId),
          eq(identidadesUsuario.usuarioId, usuarioId),
        ),
      );
  }

  async nombreDe(usuarioId: string): Promise<string> {
    const [fila] = await this.db.db
      .select({ nombre: usuarios.nombre })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    return fila?.nombre ?? 'alguien';
  }
}
