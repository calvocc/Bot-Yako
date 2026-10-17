import type { Boton } from '../../channels/channel.types';

export interface OpcionLista {
  id: string;
  texto: string;
}

/**
 * Todas las opciones como botones, sin paginar.
 *
 * Telegram admite teclados largos, así que la lista se muestra completa
 * siempre: tener que tocar "Ver más" en medio de un partido para encontrar
 * a un jugador es más lento que deslizar el teclado.
 */
export function botonesDeOpciones(opciones: readonly OpcionLista[]): Boton[] {
  return opciones.map((o) => ({ id: o.id, texto: recortar(o.texto, 20) }));
}

function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

/**
 * Id del viejo botón "Ver más", de cuando el bot paginaba. Un mensaje
 * enviado antes de quitar el paginado todavía puede tenerlo: los pasos que
 * cierran el flujo ante un botón desconocido lo reconocen y vuelven a
 * mostrar la lista, ahora completa, en vez de terminar a mitad de camino.
 */
export const ID_VER_MAS_LEGADO = 'pag:mas';
