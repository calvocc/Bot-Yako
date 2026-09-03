/**
 * Fechas de partido.
 *
 * La columna `partidos.fecha` es un `date` sin hora: representa el día en que
 * se jugó, no un instante. Y "hoy" tiene que ser hoy en Colombia, no en el
 * servidor: con Railway en UTC, un partido del domingo por la noche se
 * guardaría como lunes.
 */

export const ZONA_HORARIA = 'America/Bogota';

const FORMATO_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha local de Colombia como `yyyy-mm-dd`. */
export function hoyLocal(ahora: Date = new Date()): string {
  return FORMATO_ISO.format(ahora);
}

const DIAS_MS = 86_400_000;

/** Desplaza una fecha ISO en días, sin pasar por husos horarios. */
export function sumarDias(iso: string, dias: number): string {
  const base = Date.parse(`${iso}T00:00:00Z`);
  return new Date(base + dias * DIAS_MS).toISOString().slice(0, 10);
}

/**
 * Interpreta lo que escribe la gente: "hoy", "ayer", "12/10", "12-10-2026".
 *
 * Sin año se asume el más cercano: un "05-01" escrito el 28 de diciembre es
 * enero del año que viene, no de enero pasado.
 */
export function parsearFecha(texto: string, hoy: string = hoyLocal()): string | null {
  const limpio = texto.trim().toLowerCase();

  if (limpio === 'hoy') return hoy;
  if (limpio === 'ayer') return sumarDias(hoy, -1);
  if (limpio === 'mañana' || limpio === 'manana') return sumarDias(hoy, 1);

  const partes = limpio.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:\s*[-/.]\s*(\d{2,4}))?$/);

  if (!partes) return null;

  const dia = Number(partes[1]);
  const mes = Number(partes[2]);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const anioActual = Number(hoy.slice(0, 4));
  const anio = partes[3] ? normalizarAnio(Number(partes[3])) : anioActual;

  const iso = `${String(anio).padStart(4, '0')}-${pad(mes)}-${pad(dia)}`;

  if (!esFechaReal(iso)) return null;
  if (partes[3]) return iso;

  return anioMasCercano(iso, hoy);
}

/**
 * Con año de dos cifras, elige el siglo por cercanía: `26` es 2026 y `99` es
 * 1999, que es lo que espera cualquiera al escribir una fecha de partido.
 */
function normalizarAnio(anio: number): number {
  if (anio >= 1000) return anio;
  return anio <= 70 ? 2000 + anio : 1900 + anio;
}

/**
 * Elige entre este año, el anterior y el siguiente el que quede más cerca de
 * hoy. Resuelve el cruce de año en las dos direcciones sin casos especiales.
 */
function anioMasCercano(iso: string, hoy: string): string {
  const [anio, resto] = [Number(iso.slice(0, 4)), iso.slice(4)];
  const referencia = Date.parse(`${hoy}T00:00:00Z`);

  const candidatos = [anio - 1, anio, anio + 1]
    .map((a) => `${a}${resto}`)
    .filter(esFechaReal)
    .sort((a, b) => distancia(a, referencia) - distancia(b, referencia));

  return candidatos[0] ?? iso;
}

function distancia(iso: string, referencia: number): number {
  return Math.abs(Date.parse(`${iso}T00:00:00Z`) - referencia);
}

/** Descarta un 31 de febrero, que el constructor de Date aceptaría corriéndolo. */
function esFechaReal(iso: string): boolean {
  const fecha = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === iso;
}

function pad(valor: number): string {
  return String(valor).padStart(2, '0');
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Rótulo corto para listas y botones: "hoy", "ayer" o "12 oct". */
export function describirFecha(iso: string, hoy: string = hoyLocal()): string {
  if (iso === hoy) return 'hoy';
  if (iso === sumarDias(hoy, -1)) return 'ayer';
  if (iso === sumarDias(hoy, 1)) return 'mañana';

  const [anio, mes, dia] = iso.split('-');
  const etiqueta = `${Number(dia)} ${MESES[Number(mes) - 1] ?? mes}`;

  return anio === hoy.slice(0, 4) ? etiqueta : `${etiqueta} ${anio}`;
}
