import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DbService, type EjecutorDb } from '../db/db.service';
import { eventos, partidoTitulares } from '../db/schema';
import { calcularMinutosJugados, type CambioJugado, derivarEnCancha } from './alineacion';

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
   * Todos los que jugaron en algún momento del partido: titulares más quien
   * entró por cambio. A diferencia de `enCanchaDe` (quién sigue en cancha
   * ahora mismo), esto no descuenta a quien ya salió -- es la base para
   * mostrar la nota de todos en el resumen, no solo de quien terminó el
   * partido.
   */
  async participantesDe(partidoId: string, tx?: EjecutorDb): Promise<string[]> {
    const [titulares, cambios] = await Promise.all([
      this.titularesDe(partidoId, tx),
      this.cambiosDe(partidoId, tx),
    ]);

    return [...new Set([...titulares, ...cambios.map((c) => c.entra)])];
  }

  /**
   * Minutos jugados por cada jugador, para el bono de cierre (valla invicta
   * / goles recibidos) de `puntaje.ts`.
   *
   * Sin titulares registrados (partido legado, o uno cargado enteramente
   * post partido) devuelve un `Map` vacío: no hay forma honesta de saber
   * minutos ahí, y por lo tanto tampoco se disparan los bonos de cierre
   * para ese partido — pero sí puede seguir habiendo notas de quien tuvo
   * algún evento.
   */
  async minutosJugadosDe(
    partidoId: string,
    minutoFinal: number,
    tx?: EjecutorDb,
  ): Promise<Map<string, number>> {
    const [titulares, cambios] = await Promise.all([
      this.titularesDe(partidoId, tx),
      this.cambiosDe(partidoId, tx),
    ]);

    if (titulares.length === 0) return new Map();

    return calcularMinutosJugados(minutoFinal, titulares, cambios);
  }

  /**
   * `participantesDe` + `minutosJugadosDe` en una sola consulta de titulares
   * y cambios -- `ResumenService.generar` necesita las dos cosas, y sin esto
   * eran dos SELECT de titulares y dos de cambios por cada /resumen.
   */
  async datosDeParticipacion(
    partidoId: string,
    minutoFinal: number,
    tx?: EjecutorDb,
  ): Promise<{ participantes: string[]; minutos: Map<string, number> }> {
    const [titulares, cambios] = await Promise.all([
      this.titularesDe(partidoId, tx),
      this.cambiosDe(partidoId, tx),
    ]);

    return {
      participantes: [...new Set([...titulares, ...cambios.map((c) => c.entra)])],
      minutos:
        titulares.length === 0
          ? new Map<string, number>()
          : calcularMinutosJugados(minutoFinal, titulares, cambios),
    };
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
      .select({
        sale: eventos.jugadorId,
        entra: eventos.jugadorEntraId,
        minuto: eventos.minutoCalculado,
      })
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
