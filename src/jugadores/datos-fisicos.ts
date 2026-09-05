import { hoyLocal } from '../partidos/fechas';

/**
 * Validación de los datos básicos que carga /editarjugador.
 *
 * Deliberadamente aparte del parser de fechas de partido (`partidos/fechas.ts`):
 * ese asume "sin año, el más cercano a hoy" -- útil para "el partido del
 * sábado pasado", sin sentido para una fecha de nacimiento, que siempre
 * necesita año explícito. Los rangos de peso/estatura son los mismos que
 * los checks de la migración (`jugadores_peso_check`/`jugadores_estatura_check`),
 * a propósito: así el error que ve quien escribe y el que tiraría la base
 * coinciden.
 */
export const EDAD_MINIMA = 4;
export const EDAD_MAXIMA = 20;
export const PESO_MIN_KG = 10;
export const PESO_MAX_KG = 120;
export const ESTATURA_MIN_CM = 80;
export const ESTATURA_MAX_CM = 210;

/** "12/10/2018", "12-10-2018", "12.10.2018". Año siempre explícito, de 4 cifras. */
export function parsearFechaNacimiento(texto: string, hoy: string = hoyLocal()): string | null {
  const partes = texto.trim().match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})$/);

  if (!partes) return null;

  const dia = Number(partes[1]);
  const mes = Number(partes[2]);
  const anio = Number(partes[3]);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const iso = `${String(anio).padStart(4, '0')}-${pad(mes)}-${pad(dia)}`;

  if (!esFechaReal(iso)) return null;
  if (iso > hoy) return null;

  const edad = edadEn(iso, hoy);

  return edad >= EDAD_MINIMA && edad <= EDAD_MAXIMA ? iso : null;
}

/** "35", "35.5", "35,5" -- coma o punto, da igual. */
export function parsearPeso(texto: string): number | null {
  const numero = Number(texto.trim().replace(',', '.'));

  if (!Number.isFinite(numero) || numero < PESO_MIN_KG || numero > PESO_MAX_KG) return null;

  return Math.round(numero * 100) / 100;
}

/** "135" -- centímetros, entero. */
export function parsearEstatura(texto: string): number | null {
  const numero = Number(texto.trim());

  if (!Number.isInteger(numero) || numero < ESTATURA_MIN_CM || numero > ESTATURA_MAX_CM) {
    return null;
  }

  return numero;
}

function edadEn(iso: string, hoy: string): number {
  const [anioNac, mesNac, diaNac] = iso.split('-').map(Number);
  const [anioHoy, mesHoy, diaHoy] = hoy.split('-').map(Number);

  const cumplioEsteAnio = mesHoy > mesNac || (mesHoy === mesNac && diaHoy >= diaNac);

  return anioHoy - anioNac - (cumplioEsteAnio ? 0 : 1);
}

/** Descarta un 31 de febrero, que el constructor de `Date` aceptaría corriéndolo. */
function esFechaReal(iso: string): boolean {
  const fecha = new Date(`${iso}T00:00:00Z`);

  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === iso;
}

function pad(valor: number): string {
  return String(valor).padStart(2, '0');
}
