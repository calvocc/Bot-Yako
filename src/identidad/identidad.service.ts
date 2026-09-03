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

    return this.crear(mensaje);
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

      await tx
        .insert(identidadesUsuario)
        .values({
          usuarioId: usuario.id,
          canal: mensaje.canal,
          canalUserId: mensaje.canalUserId,
          chatId: mensaje.chatId,
        })
        // Dos mensajes casi simultáneos del mismo usuario nuevo podrían
        // intentar crear la identidad dos veces; la clave primaria lo impide
        // y acá se resuelve sin romper la conversación.
        .onConflictDoNothing();

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
