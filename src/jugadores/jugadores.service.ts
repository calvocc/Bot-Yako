import { Injectable } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { DbService, type EjecutorDb } from '../db/db.service';
import { equipos, jugadores, personas } from '../db/schema';
import type { EquiposService } from '../equipos/equipos.service';

export interface Jugador {
  id: string;
  nombre: string;
  dorsal: number | null;
  activo: boolean;
}

/** Un jugador con el mismo nombre, en otro equipo de la misma academia. */
export interface CandidatoAcademia {
  jugadorId: string;
  nombre: string;
  dorsal: number | null;
  equipoId: string;
  equipoNombre: string;
}

export class DorsalOcupadoError extends Error {
  constructor(
    readonly dorsal: number,
    readonly ocupadoPor: string,
  ) {
    super(`El dorsal ${dorsal} ya lo tiene ${ocupadoPor}`);
  }
}

@Injectable()
export class JugadoresService {
  constructor(private readonly db: DbService) {}

  async listar(equipoId: string, incluirInactivos = false, tx?: EjecutorDb): Promise<Jugador[]> {
    const filas = await (tx ?? this.db.db)
      .select()
      .from(jugadores)
      .where(eq(jugadores.equipoId, equipoId))
      .orderBy(asc(jugadores.dorsal), asc(jugadores.nombre));

    return filas
      .filter((f) => incluirInactivos || f.activo)
      .map((f) => ({ id: f.id, nombre: f.nombre, dorsal: f.dorsal, activo: f.activo }));
  }

  /**
   * Da de alta un jugador.
   *
   * El dorsal duplicado se comprueba antes de insertar para poder decir *quién*
   * lo tiene: el índice único de la base también lo impide, pero su error no
   * sirve para explicárselo a nadie.
   */
  async crear(
    equipoId: string,
    nombre: string,
    dorsal?: number,
    personaId?: string,
    tx?: EjecutorDb,
  ): Promise<Jugador> {
    const ejecutor = tx ?? this.db.db;

    if (dorsal !== undefined) {
      const ocupado = (await this.listar(equipoId, false, ejecutor)).find(
        (j) => j.dorsal === dorsal,
      );

      if (ocupado) throw new DorsalOcupadoError(dorsal, ocupado.nombre);
    }

    const [fila] = await ejecutor
      .insert(jugadores)
      .values({ equipoId, nombre, dorsal: dorsal ?? null, personaId })
      .returning();

    return { id: fila.id, nombre: fila.nombre, dorsal: fila.dorsal, activo: fila.activo };
  }

  /**
   * Baja lógica. No se borra la fila porque sus eventos siguen contando para
   * las estadísticas de los partidos ya jugados.
   */
  async desactivar(equipoId: string, jugadorId: string): Promise<boolean> {
    const filas = await this.db.db
      .update(jugadores)
      .set({ activo: false })
      .where(and(eq(jugadores.id, jugadorId), eq(jugadores.equipoId, equipoId)))
      .returning({ id: jugadores.id });

    return filas.length > 0;
  }

  async reactivar(equipoId: string, jugadorId: string): Promise<boolean> {
    const filas = await this.db.db
      .update(jugadores)
      .set({ activo: true })
      .where(and(eq(jugadores.id, jugadorId), eq(jugadores.equipoId, equipoId)))
      .returning({ id: jugadores.id });

    return filas.length > 0;
  }

  /**
   * Busca un jugador por nombre dentro de la plantilla de un equipo (activos
   * e inactivos), sin crear nada. Extraído de `resolverOCrear` para que el
   * llamador pueda decidir qué hacer con un "no está" antes de dar de alta —
   * en particular, ofrecer vincularlo con su ficha de otro equipo de la
   * misma academia en vez de crear un duplicado sin relación.
   */
  async buscarEnEquipo(equipoId: string, parseado: JugadorParseado): Promise<Jugador | null> {
    const plantilla = await this.listar(equipoId, true);
    const buscado = parseado.nombre.trim().toLowerCase();

    // El nombre exacto manda, pero si no matchea y el dorsal sí es de alguien
    // conocido, es la misma persona escrita distinto ("Jacob, 10" contra
    // "Jacob Restrepo" #10): usarlo evita un duplicado en la plantilla.
    return (
      plantilla.find((j) => j.nombre.toLowerCase() === buscado) ??
      (parseado.dorsal !== undefined
        ? plantilla.find((j) => j.dorsal === parseado.dorsal)
        : undefined) ??
      null
    );
  }

  /**
   * Busca un jugador por nombre y, si no está en la plantilla, lo da de alta.
   *
   * Es lo que hace falta al borde de la cancha: aparece alguien que nadie
   * cargó y el evento no puede esperar a que se edite la plantilla. Compartido
   * entre la carga en vivo (`cargar.flujo.ts`) y la carga post partido, que
   * resuelven jugadores de la misma forma.
   *
   * No busca en otros equipos de la academia — eso es a propósito: crear acá
   * puede pasar en medio de cualquier carga, sin oportunidad de preguntar
   * "¿es el mismo Jacob de Sub-9?" antes de escribir. `cargar.flujo.ts` sí
   * pregunta, con `buscarEnEquipo` + `buscarEnAcademia` + `vincularNuevoEquipo`
   * por separado, antes de decidir crear uno nuevo sin vínculo.
   */
  async resolverOCrear(
    equipoId: string,
    parseado: JugadorParseado,
  ): Promise<{ jugador: Jugador; creado: boolean }> {
    const existente = await this.buscarEnEquipo(equipoId, parseado);

    if (existente) return { jugador: existente, creado: false };

    const jugador = await this.crearConDorsalSiLibre(equipoId, parseado);

    return { jugador, creado: true };
  }

  /**
   * Jugadores con el mismo nombre en otros equipos de la misma academia.
   *
   * Es la base para no duplicar personas entre equipos: antes de crear a
   * alguien que no está en la plantilla de este equipo, se busca si ya
   * existe en otro — para ofrecer vincularlo en vez de crear una ficha sin
   * relación. Solo entre jugadores activos: uno dado de baja en otro equipo
   * no es un candidato obvio a "juega acá también".
   *
   * A propósito busca en TODA la academia, no solo en equipos donde quien
   * pregunta tiene rol: la academia (no el equipo) es el límite de confianza
   * para esta acción — mismo criterio que ya usa `esAdminDeAcademia`, que
   * trata "admin de un equipo" como "admin de toda la academia" para ciertas
   * acciones. Restringir esto por equipo rompería el caso de uso principal
   * (un chico que se pasó de equipo, así que quien carga ya no tiene rol en
   * el equipo de origen). Los llamadores igual exigen rol de Editor/Admin en
   * el equipo *destino* antes de invocar esto o `vincularNuevoEquipo` — un
   * Viewer nunca llega hasta acá.
   */
  async buscarEnAcademia(
    academiaId: string,
    nombre: string,
    excluirEquipoId?: string,
  ): Promise<CandidatoAcademia[]> {
    const buscado = nombre.trim().toLowerCase();

    if (!buscado) return [];

    const filas = await this.db.db
      .select({
        jugadorId: jugadores.id,
        nombre: jugadores.nombre,
        dorsal: jugadores.dorsal,
        equipoId: jugadores.equipoId,
        equipoNombre: equipos.nombre,
      })
      .from(jugadores)
      .innerJoin(equipos, eq(equipos.id, jugadores.equipoId))
      .where(
        and(
          eq(equipos.academiaId, academiaId),
          eq(jugadores.activo, true),
          sql`lower(trim(${jugadores.nombre})) = ${buscado}`,
          excluirEquipoId ? ne(jugadores.equipoId, excluirEquipoId) : undefined,
        ),
      )
      .orderBy(asc(jugadores.nombre));

    return filas;
  }

  /**
   * Como `buscarEnAcademia`, pero para varios nombres de una sola vez — una
   * consulta para todo un lote pegado en `/plantilla`, en vez de una por
   * jugador (`altaEnLote`, en `pasos-plantilla.ts`).
   */
  async buscarVariosEnAcademia(
    academiaId: string,
    nombres: readonly string[],
    excluirEquipoId?: string,
  ): Promise<CandidatoAcademia[]> {
    const buscados = [...new Set(nombres.map((n) => n.trim().toLowerCase()).filter(Boolean))];

    if (buscados.length === 0) return [];

    const filas = await this.db.db
      .select({
        jugadorId: jugadores.id,
        nombre: jugadores.nombre,
        dorsal: jugadores.dorsal,
        equipoId: jugadores.equipoId,
        equipoNombre: equipos.nombre,
      })
      .from(jugadores)
      .innerJoin(equipos, eq(equipos.id, jugadores.equipoId))
      .where(
        and(
          eq(equipos.academiaId, academiaId),
          eq(jugadores.activo, true),
          sql`lower(trim(${jugadores.nombre})) in ${buscados}`,
          excluirEquipoId ? ne(jugadores.equipoId, excluirEquipoId) : undefined,
        ),
      )
      .orderBy(asc(jugadores.nombre));

    return filas;
  }

  /**
   * Da de alta a un jugador en un equipo nuevo, vinculado a la misma persona
   * que una ficha ya existente (de otro equipo de la academia).
   *
   * Si esa ficha todavía no tiene `personaId` —el caso normal, hoy nadie lo
   * usa— se le crea uno ahí mismo: recién en este momento hay confirmación de
   * que dos fichas son la misma persona, así que es el primer punto donde
   * vale la pena escribir esa relación. Todo en una transacción para que dos
   * cargas concurrentes vinculando al mismo jugador no lo dejen a medias.
   */
  async vincularNuevoEquipo(
    equipoId: string,
    parseado: JugadorParseado,
    jugadorOrigenId: string,
  ): Promise<Jugador> {
    return this.db.db.transaction(async (tx) => {
      const [origen] = await tx
        .select()
        .from(jugadores)
        .where(eq(jugadores.id, jugadorOrigenId))
        .for('update')
        .limit(1);

      if (!origen) {
        throw new Error(`No encontré el jugador de origen ${jugadorOrigenId} para vincular`);
      }

      let personaId = origen.personaId;

      if (!personaId) {
        const [persona] = await tx.insert(personas).values({ nombre: origen.nombre }).returning();

        personaId = persona.id;
        await tx.update(jugadores).set({ personaId }).where(eq(jugadores.id, origen.id));
      }

      // Repetir el vínculo (doble tap, o confirmarlo dos veces por error) no
      // debe duplicar la ficha: si el equipo destino ya tiene una fila de
      // esta misma persona, se devuelve esa en vez de crear una segunda.
      const [yaVinculado] = await tx
        .select()
        .from(jugadores)
        .where(and(eq(jugadores.equipoId, equipoId), eq(jugadores.personaId, personaId)))
        .limit(1);

      if (yaVinculado) {
        return {
          id: yaVinculado.id,
          nombre: yaVinculado.nombre,
          dorsal: yaVinculado.dorsal,
          activo: yaVinculado.activo,
        };
      }

      return this.crearConDorsalSiLibre(equipoId, parseado, personaId, tx);
    });
  }

  /**
   * El dorsal pedido, o ninguno si ya es de otro en este equipo — el alta no
   * puede fallar en medio de una carga por un número.
   *
   * Pública (no solo para `resolverOCrear`/`vincularNuevoEquipo` internos):
   * es el camino seguro que cualquier alta fuera de una lista pegada debería
   * usar en vez de `crear()` a secas, que sí puede tirar `DorsalOcupadoError`.
   */
  async crearConDorsalSiLibre(
    equipoId: string,
    parseado: JugadorParseado,
    personaId?: string,
    tx?: EjecutorDb,
  ): Promise<Jugador> {
    const plantilla = await this.listar(equipoId, true, tx);
    const dorsalLibre = plantilla.every((j) => j.dorsal !== parseado.dorsal);

    return this.crear(
      equipoId,
      parseado.nombre,
      dorsalLibre ? parseado.dorsal : undefined,
      personaId,
      tx,
    );
  }
}

export interface JugadorParseado {
  nombre: string;
  dorsal?: number;
}

/**
 * Candidatos de un jugador nuevo en el resto de la academia, resolviendo el
 * equipo primero. Compartido entre `cargar.flujo.ts` y `plantilla.flujo.ts`,
 * que antes repetían el mismo par de llamadas (`equipos.obtener` +
 * `jugadores.buscarEnAcademia`) cada uno por su lado.
 */
export async function candidatosDeEquipo(
  equipos: Pick<EquiposService, 'obtener'>,
  jugadores: JugadoresService,
  equipoId: string,
  nombre: string,
): Promise<CandidatoAcademia[]> {
  const equipo = await equipos.obtener(equipoId);

  return equipo ? jugadores.buscarEnAcademia(equipo.academiaId, nombre, equipoId) : [];
}

/**
 * Interpreta una línea de plantilla: "Jacob, 10", "Jacob 10", "10 Jacob" o
 * solo "Jacob".
 *
 * El formato libre es deliberado: la plantilla se carga desde el teléfono, a
 * veces al borde de la cancha, y exigir una sintaxis exacta ahí es fricción.
 */
export function parsearJugador(linea: string): JugadorParseado | null {
  const limpia = linea.trim().replace(/\s+/g, ' ');

  if (!limpia) return null;

  // "Jacob, 10" o "Jacob 10"
  const alFinal = limpia.match(/^(.+?)[,\s]+(\d{1,2})$/);
  if (alFinal) {
    return { nombre: alFinal[1].trim().replace(/,$/, ''), dorsal: Number(alFinal[2]) };
  }

  // "10 Jacob" o "10, Jacob"
  const alInicio = limpia.match(/^(\d{1,2})[,\s]+(.+)$/);
  if (alInicio) {
    return { nombre: alInicio[2].trim(), dorsal: Number(alInicio[1]) };
  }

  const soloNombre = limpia.replace(/,$/, '').trim();

  // Un número solo es un dorsal sin nombre, no un nombre: "10" a secas no dice
  // quién es nadie. Tratarlo como nombre creaba un jugador literal "10".
  if (!soloNombre || /^\d+$/.test(soloNombre)) return null;

  return { nombre: soloNombre };
}

/** Varias líneas de una vez: pegar una lista completa también funciona. */
export function parsearPlantilla(texto: string): JugadorParseado[] {
  return texto
    .split('\n')
    .map((l) => parsearJugador(l))
    .filter((j): j is JugadorParseado => j !== null);
}

export interface GoleadorParseado {
  nombre: string;
  cantidad: number;
}

/**
 * "Jacob 2, Andrés 1" — cuántos goles metió cada uno, para la carga post
 * partido (RF-4.1: goleadores sin minuto).
 *
 * Reusa `parsearJugador` por segmento separado por comas: la gramática
 * "nombre + número" es la misma que la de la plantilla, solo cambia qué
 * significa el número (cantidad de goles, no dorsal). Sin número se asume
 * un solo gol.
 */
export function parsearGoleadores(texto: string): GoleadorParseado[] | null {
  const segmentos = texto
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segmentos.length === 0) return null;

  const goleadores: GoleadorParseado[] = [];

  for (const segmento of segmentos) {
    const parseado = parsearJugador(segmento);

    if (!parseado) return null;

    goleadores.push({ nombre: parseado.nombre, cantidad: parseado.dorsal ?? 1 });
  }

  return goleadores;
}

export interface TarjetaParseada {
  nombre: string;
  color: 'amarilla' | 'roja';
}

const COLORES_TARJETA: Record<string, 'amarilla' | 'roja'> = {
  amarilla: 'amarilla',
  amarillas: 'amarilla',
  roja: 'roja',
  rojas: 'roja',
};

/**
 * "Andrés amarilla, Jacob roja" — tarjetas de la carga post partido (RF-4.1:
 * tarjetas sin minuto). Acá el segundo término no es un número, así que no
 * se puede reusar `parsearJugador`: se toma la última palabra como color y
 * el resto como nombre.
 */
export function parsearTarjetas(texto: string): TarjetaParseada[] | null {
  const segmentos = texto
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segmentos.length === 0) return null;

  const tarjetas: TarjetaParseada[] = [];

  for (const segmento of segmentos) {
    const palabras = segmento.split(/\s+/);
    const color = COLORES_TARJETA[palabras[palabras.length - 1]?.toLowerCase() ?? ''];
    const nombre = palabras.slice(0, -1).join(' ').trim();

    if (!color || !nombre) return null;

    tarjetas.push({ nombre, color });
  }

  return tarjetas;
}

export function describirJugador(jugador: Jugador | JugadorParseado): string {
  return jugador.dorsal !== undefined && jugador.dorsal !== null
    ? `${jugador.nombre} #${jugador.dorsal}`
    : jugador.nombre;
}
