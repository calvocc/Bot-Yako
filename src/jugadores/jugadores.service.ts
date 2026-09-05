import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { jugadores } from '../db/schema';

export interface Jugador {
  id: string;
  nombre: string;
  dorsal: number | null;
  activo: boolean;
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

  async listar(equipoId: string, incluirInactivos = false): Promise<Jugador[]> {
    const filas = await this.db.db
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
  async crear(equipoId: string, nombre: string, dorsal?: number): Promise<Jugador> {
    if (dorsal !== undefined) {
      const ocupado = (await this.listar(equipoId)).find((j) => j.dorsal === dorsal);

      if (ocupado) throw new DorsalOcupadoError(dorsal, ocupado.nombre);
    }

    const [fila] = await this.db.db
      .insert(jugadores)
      .values({ equipoId, nombre, dorsal: dorsal ?? null })
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
   * Busca un jugador por nombre y, si no está en la plantilla, lo da de alta.
   *
   * Es lo que hace falta al borde de la cancha: aparece alguien que nadie
   * cargó y el evento no puede esperar a que se edite la plantilla. Se busca
   * también entre los inactivos, para no crear un duplicado de alguien que
   * estaba dado de baja. Compartido entre la carga en vivo
   * (`cargar.flujo.ts`) y la carga post partido, que resuelven jugadores de
   * la misma forma.
   */
  async resolverOCrear(
    equipoId: string,
    parseado: JugadorParseado,
  ): Promise<{ jugador: Jugador; creado: boolean }> {
    const plantilla = await this.listar(equipoId, true);
    const buscado = parseado.nombre.toLowerCase();

    // El nombre exacto manda, pero si no matchea y el dorsal sí es de alguien
    // conocido, es la misma persona escrita distinto ("Jacob, 10" contra
    // "Jacob Restrepo" #10): usarlo evita un duplicado en la plantilla.
    const existente =
      plantilla.find((j) => j.nombre.toLowerCase() === buscado) ??
      (parseado.dorsal !== undefined
        ? plantilla.find((j) => j.dorsal === parseado.dorsal)
        : undefined);

    if (existente) return { jugador: existente, creado: false };

    // El dorsal se descarta si ya es de otro: el alta no puede fallar en
    // medio de una carga por un número.
    const dorsalLibre = plantilla.every((j) => j.dorsal !== parseado.dorsal);
    const jugador = await this.crear(
      equipoId,
      parseado.nombre,
      dorsalLibre ? parseado.dorsal : undefined,
    );

    return { jugador, creado: true };
  }
}

export interface JugadorParseado {
  nombre: string;
  dorsal?: number;
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

/**
 * El cuerpo de una plantilla como lista de viñetas ("• Nombre #dorsal"), o
 * el texto que corresponda cuando está vacía. Common a `/plantilla` y a
 * `/stats` sin argumento — cada uno arma su propio encabezado alrededor.
 */
export function formatearListaJugadores(
  lista: (Jugador | JugadorParseado)[],
  textoVacio: string,
): string {
  return lista.length === 0
    ? textoVacio
    : lista.map((jugador) => `• ${describirJugador(jugador)}`).join('\n');
}
