import type { Boton } from '../../channels/channel.types';

/**
 * Máximo de opciones por mensaje.
 *
 * Lo fija WhatsApp, que admite hasta 10 filas en una lista interactiva. Se deja
 * una para "Ver más", así que quedan 9 de contenido.
 */
export const OPCIONES_POR_PAGINA = 9;

export const ID_VER_MAS = 'pag:mas';

export interface OpcionPaginable {
  id: string;
  texto: string;
}

/**
 * Arma los botones de una página, agregando "Ver más" si quedan opciones.
 *
 * Recortar la lista sin más deja a las personas que caen fuera del corte
 * permanentemente inalcanzables: en una plantilla de 20 jugadores, a los 11
 * últimos no se les puede ni dar de baja.
 */
export function botonesPaginados(
  opciones: readonly OpcionPaginable[],
  pagina: number,
  reservar = 0,
): { botones: Boton[]; hayMas: boolean } {
  const porPagina = tamanoDePagina(reservar);
  const desde = pagina * porPagina;
  const trozo = opciones.slice(desde, desde + porPagina);
  const hayMas = desde + porPagina < opciones.length;

  const botones: Boton[] = trozo.map((o) => ({ id: o.id, texto: recortar(o.texto, 20) }));

  if (hayMas) {
    botones.push({ id: ID_VER_MAS, texto: 'Ver más' });
  }

  return { botones, hayMas };
}

/**
 * Cuántas opciones entran, descontando los botones que el paso agrega aparte.
 *
 * Sin este descuento, un paso que suma "Otro jugador" y "Sin identificar" a una
 * página llena manda 12 botones, y la lista de WhatsApp corta en 10: los dos
 * últimos jugadores desaparecen sin que nadie se entere.
 */
function tamanoDePagina(reservar: number): number {
  return Math.max(1, OPCIONES_POR_PAGINA - reservar);
}

/** Cuántas páginas hacen falta; siempre al menos una. */
export function totalPaginas(cantidad: number, reservar = 0): number {
  return Math.max(1, Math.ceil(cantidad / tamanoDePagina(reservar)));
}

/** Avanza a la página siguiente, volviendo a la primera al pasarse. */
export function paginaSiguiente(pagina: number, cantidad: number, reservar = 0): number {
  return (pagina + 1) % totalPaginas(cantidad, reservar);
}

function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}
