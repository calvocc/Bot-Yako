import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DbService, type EjecutorDb } from '../db/db.service';
import { eventos, partidoTitulares } from '../db/schema';
import { type CambioJugado, derivarEnCancha } from './alineacion';

@Injectable()
export class AlineacionService {
  constructor(private readonly db: DbService) {}

  async titularesDe(partidoId: string, tx?: EjecutorDb): Promise<string[]> {
    const filas = await (tx ?? this.db.db)
      .select({ jugadorId: partidoTitulares.jugadorId })
      .from(partidoTitulares)
      .where(eq(partidoTitulares.partidoId, partidoId));

    return filas.map((f) => f.jugadorId);
  }

  /**
   * Quién sigue en cancha ahora mismo.
   *
   * Vacío significa dos cosas distintas según quien llama: "todavía no se
   * eligió titular" (un partido nuevo, antes del gate) o "este partido
   * arrancó antes de que la titular existiera" (uno legado). En los dos
   * casos, quien filtra jugadores con esto tiene que caer de vuelta a la
   * plantilla completa en vez de no ofrecer a nadie — ver `cargar.flujo.ts`.
   */
  async enCanchaDe(partidoId: string, tx?: EjecutorDb): Promise<Set<string>> {
    const [titulares, cambios] = await Promise.all([
      this.titularesDe(partidoId, tx),
      this.cambiosDe(partidoId, tx),
    ]);

    return derivarEnCancha(titulares, cambios);
  }

  /**
   * Suma un jugador a la cancha si todavía no estaba.
   *
   * Para cuando alguien que nadie había titularizado ni hecho entrar por
   * cambio aparece de golpe —un chico que se sumó tarde y anota un gol,
   * cargado escribiendo su nombre—: si puede anotar, tiene que poder
   * aparecer en los eventos que siguen también. `onConflictDoNothing` cubre
   * el caso normal de alguien que ya estaba.
   */
  async agregarSiHaceFalta(
    partidoId: string,
    jugadorId: string,
    usuarioId: string,
    tx?: EjecutorDb,
  ): Promise<void> {
    await (tx ?? this.db.db)
      .insert(partidoTitulares)
      .values({ partidoId, jugadorId, creadoPor: usuarioId })
      .onConflictDoNothing();
  }

  private async cambiosDe(partidoId: string, tx?: EjecutorDb): Promise<CambioJugado[]> {
    const filas = await (tx ?? this.db.db)
      .select({ sale: eventos.jugadorId, entra: eventos.jugadorEntraId })
      .from(eventos)
      .where(
        and(
          eq(eventos.partidoId, partidoId),
          eq(eventos.tipo, 'cambio'),
          isNull(eventos.eliminadoEn),
        ),
      )
      .orderBy(asc(eventos.creadoEn));

    // El check de la base exige los dos jugadores en un cambio; el filtro es
    // solo para que TypeScript lo sepa también.
    return filas.filter((f): f is CambioJugado => f.sale !== null && f.entra !== null);
  }
}
