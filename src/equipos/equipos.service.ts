import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { equipos } from '../db/schema';
import { MembresiasService } from '../identidad/membresias.service';

export interface FormatoPartido {
  cantidadTiempos: number;
  minutosPorTiempo: number;
}

export interface Equipo {
  id: string;
  nombre: string;
  academiaId: string;
  cantidadTiemposDefault: number;
  minutosPorTiempoDefault: number;
}

/** Presets que cubren la mayoría del fútbol base; el resto va por "Personalizado". */
export const FORMATOS_SUGERIDOS: readonly (FormatoPartido & { etiqueta: string })[] = [
  { etiqueta: '2 tiempos x 25 min', cantidadTiempos: 2, minutosPorTiempo: 25 },
  { etiqueta: '2 tiempos x 30 min', cantidadTiempos: 2, minutosPorTiempo: 30 },
  { etiqueta: '4 tiempos x 12 min', cantidadTiempos: 4, minutosPorTiempo: 12 },
];

export const LIMITES_FORMATO = {
  tiemposMin: 1,
  tiemposMax: 6,
  minutosMin: 1,
  minutosMax: 60,
} as const;

export class NombreDeEquipoRepetidoError extends Error {
  constructor(nombre: string) {
    super(`Ya existe un equipo llamado "${nombre}" en esta academia`);
  }
}

@Injectable()
export class EquiposService {
  constructor(
    private readonly db: DbService,
    private readonly membresias: MembresiasService,
  ) {}

  /**
   * Crea el equipo y deja como admin a quien lo crea.
   *
   * Van juntos a propósito: un equipo sin admin no se puede administrar, así
   * que crearlo sin asignar el rol dejaría un equipo inservible si algo fallara
   * en medio.
   */
  async crear(
    academiaId: string,
    nombre: string,
    formato: FormatoPartido,
    creadorId: string,
  ): Promise<Equipo> {
    const yaExiste = await this.buscarPorNombre(academiaId, nombre);

    if (yaExiste) throw new NombreDeEquipoRepetidoError(nombre);

    const equipo = await this.db.db.transaction(async (tx) => {
      const [fila] = await tx
        .insert(equipos)
        .values({
          academiaId,
          nombre,
          cantidadTiemposDefault: formato.cantidadTiempos,
          minutosPorTiempoDefault: formato.minutosPorTiempo,
        })
        .returning();

      // Dentro de la transacción: si esto falla, el equipo tampoco existe.
      // Fuera, quedaría un equipo sin admin y con el nombre ya ocupado, así
      // que ni siquiera se podría rehacer con el mismo nombre.
      await this.membresias.asignarRol(creadorId, fila.id, 'admin', tx);

      return fila;
    });

    return this.mapear(equipo);
  }

  async obtener(equipoId: string): Promise<Equipo | null> {
    const [fila] = await this.db.db.select().from(equipos).where(eq(equipos.id, equipoId)).limit(1);

    return fila ? this.mapear(fila) : null;
  }

  async deAcademia(academiaId: string): Promise<Equipo[]> {
    const filas = await this.db.db
      .select()
      .from(equipos)
      .where(eq(equipos.academiaId, academiaId))
      .orderBy(asc(equipos.nombre));

    return filas.map((f) => this.mapear(f));
  }

  private async buscarPorNombre(academiaId: string, nombre: string): Promise<boolean> {
    const existentes = await this.deAcademia(academiaId);
    const normalizado = nombre.trim().toLowerCase();

    return existentes.some((e) => e.nombre.trim().toLowerCase() === normalizado);
  }

  private mapear(fila: typeof equipos.$inferSelect): Equipo {
    return {
      id: fila.id,
      nombre: fila.nombre,
      academiaId: fila.academiaId,
      cantidadTiemposDefault: fila.cantidadTiemposDefault,
      minutosPorTiempoDefault: fila.minutosPorTiempoDefault,
    };
  }
}

/** Interpreta "2x25", "2 x 25", "4 tiempos de 12" y variantes. */
export function parsearFormato(texto: string): FormatoPartido | null {
  const numeros = texto.match(/\d+/g);

  if (!numeros || numeros.length < 2) return null;

  const cantidadTiempos = Number(numeros[0]);
  const minutosPorTiempo = Number(numeros[1]);
  const { tiemposMin, tiemposMax, minutosMin, minutosMax } = LIMITES_FORMATO;

  if (cantidadTiempos < tiemposMin || cantidadTiempos > tiemposMax) return null;
  if (minutosPorTiempo < minutosMin || minutosPorTiempo > minutosMax) return null;

  return { cantidadTiempos, minutosPorTiempo };
}

export function describirFormato(formato: FormatoPartido): string {
  return `${formato.cantidadTiempos} tiempos x ${formato.minutosPorTiempo} min`;
}
