import type { MensajeEntrante } from '../channels/channel.types';

/**
 * Catálogo de comandos. Es la fuente de `/ayuda` y del menú que se registra en
 * BotFather, así que agregar un comando en un solo lugar lo hace visible en los
 * dos.
 *
 * Los nombres no llevan espacios: el menú de comandos de Telegram no los admite,
 * así que `/partido nuevo` funcionaba como texto pero nunca aparecía en el
 * autocompletado (C8).
 */
export interface DefinicionComando {
  nombre: string;
  descripcion: string;
  /** Rol mínimo, tal como se muestra en /ayuda. */
  rolMinimo: 'cualquiera' | 'viewer' | 'editor' | 'admin';
  /** Si es false, no se ofrece en el menú (pero sigue funcionando). */
  visible?: boolean;
}

export const COMANDOS: readonly DefinicionComando[] = [
  {
    nombre: 'start',
    descripcion: 'Crear tu academia o entrar con un código',
    rolMinimo: 'cualquiera',
  },
  { nombre: 'ayuda', descripcion: 'Ver qué puedo hacer', rolMinimo: 'cualquiera' },
  { nombre: 'unirme', descripcion: 'Sumarte a otro equipo con un código', rolMinimo: 'cualquiera' },
  { nombre: 'equipos', descripcion: 'Ver tus equipos', rolMinimo: 'viewer' },
  { nombre: 'nuevoequipo', descripcion: 'Crear un equipo o categoría', rolMinimo: 'admin' },
  { nombre: 'plantilla', descripcion: 'Ver o editar los jugadores', rolMinimo: 'viewer' },
  { nombre: 'invitar', descripcion: 'Generar un código de invitación', rolMinimo: 'admin' },
  { nombre: 'permisos', descripcion: 'Cambiar el rol de alguien', rolMinimo: 'admin' },
  { nombre: 'nuevopartido', descripcion: 'Crear un partido', rolMinimo: 'editor' },
  { nombre: 'partidos', descripcion: 'Ver los últimos partidos', rolMinimo: 'viewer' },
  { nombre: 'cargar', descripcion: 'Cargar eventos de un partido', rolMinimo: 'editor' },
  {
    nombre: 'finalizar',
    descripcion: 'Cerrar el partido y generar el resumen',
    rolMinimo: 'editor',
  },
  { nombre: 'reabrir', descripcion: 'Reabrir un partido cerrado', rolMinimo: 'admin' },
  { nombre: 'deshacer', descripcion: 'Borrar el último evento que cargaste', rolMinimo: 'editor' },
  { nombre: 'stats', descripcion: 'Estadísticas de un jugador', rolMinimo: 'viewer' },
  { nombre: 'tabla', descripcion: 'Resumen del equipo en la temporada', rolMinimo: 'viewer' },
  { nombre: 'cancelar', descripcion: 'Salir de lo que estés haciendo', rolMinimo: 'cualquiera' },
];

export interface ComandoParseado {
  nombre: string;
  /** Lo que vino después del comando: `/stats Jacob` → `Jacob`. */
  argumento?: string;
}

/**
 * Reconoce un comando al principio del texto.
 *
 * Acepta la forma con mención que usa Telegram en grupos (`/ayuda@YakoBot`) y
 * es indiferente a mayúsculas.
 */
export function parsearComando(mensaje: MensajeEntrante): ComandoParseado | null {
  const texto = mensaje.texto?.trim();

  if (!texto?.startsWith('/')) return null;

  const [crudo, ...resto] = texto.slice(1).split(/\s+/);
  const nombre = crudo.split('@')[0].toLowerCase();

  if (!nombre) return null;

  const argumento = resto.join(' ').trim();

  return argumento ? { nombre, argumento } : { nombre };
}

/**
 * Prefijo de los botones que disparan un comando. Permite ofrecer
 * "Ver qué puedo hacer" como botón sin obligar al usuario a escribir `/ayuda`.
 */
export const PREFIJO_BOTON_COMANDO = 'cmd:';

export function botonComando(nombre: string, texto: string): { id: string; texto: string } {
  return { id: `${PREFIJO_BOTON_COMANDO}${nombre}`, texto };
}
