import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { academias } from '../db/schema';

@Injectable()
export class AcademiasService {
  constructor(private readonly db: DbService) {}

  async crear(nombre: string): Promise<{ id: string; nombre: string }> {
    const [fila] = await this.db.db
      .insert(academias)
      .values({ nombre })
      .returning({ id: academias.id, nombre: academias.nombre });

    return fila;
  }

  async obtener(academiaId: string): Promise<{ id: string; nombre: string } | null> {
    const [fila] = await this.db.db
      .select({ id: academias.id, nombre: academias.nombre })
      .from(academias)
      .where(eq(academias.id, academiaId))
      .limit(1);

    return fila ?? null;
  }
}
