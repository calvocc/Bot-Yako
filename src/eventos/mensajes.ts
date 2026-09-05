import type { Boton } from '../channels/channel.types';
import { botonesPaginados } from '../conversacion/pasos-comunes/paginacion';
import { describirMinuto, type Minuto } from '../partidos/minuto';
import type { Partido } from '../partidos/partido.mapper';
import { describirMarcador } from '../partidos/partido.mapper';
import { definicionDe, EVENTOS, type EquipoOrigen, type TipoEvento } from './evento.tipos';
import type { EventoCargado, Marcador } from './eventos.service';

export const PREFIJO_EVENTO = 'ev:';
export const PREFIJO_JUGADOR = 'jg:';
export const PREFIJO_ORIGEN = 'or:';

export const ID_JUGADOR_OTRO = 'jg:otro';
export const ID_JUGADOR_SIN_IDENTIFICAR = 'jg:nadie';
export const ID_FINALIZAR_TIEMPO = 'pa:fintiempo';
export const ID_DESHACER = 'pa:deshacer';
export const ID_FINALIZAR_PARTIDO = 'pa:finpartido';
export const ID_RESUMEN = 'pa:resumen';
export const ID_ES_OTRO = 'du:otro';
export const ID_YA_ESTABA = 'du:mismo';
export const ID_SI = 'ok:si';
export const ID_NO = 'ok:no';

export interface EstadoPanel {
  partido: Partido;
  equipoNombre: string;
  minuto: Minuto;
  /** Nota efímera arriba del panel: "▶️ Se inició el Tiempo 2 automáticamente." */
  aviso?: string;
  /**
   * Página del panel de eventos que se está mostrando. 13 tipos de evento +
   * 3 o 4 controles se pasa del límite de 10 filas de WhatsApp, así que se
   * pagina con el mismo mecanismo que ya pagina jugadores (`paginacion.ts`).
   */
  paginaEventos: number;
}

/**
 * El panel de carga en vivo.
 *
 * Es un solo mensaje que se edita en el sitio en vez de uno nuevo por
 * interacción: durante un partido, veinte paneles apilados hacen que nadie
 * encuentre el de arriba.
 */
export function panelEnVivo(estado: EstadoPanel): { texto: string; botones: Boton[] } {
  const { partido, equipoNombre, minuto, aviso, paginaEventos } = estado;

  const encabezado = `⚡ ${equipoNombre} vs ${partido.rival}`;
  const reloj =
    partido.tiempoEstado === 'en_curso'
      ? `Tiempo ${partido.tiempoActual} · min ${describirMinuto(minuto)}`
      : descripcionSinReloj(partido);

  const lineas = [aviso, encabezado, `${reloj} · ${describirMarcador(partido)}`].filter(Boolean);
  const controles = botonesDeControl(partido);

  return {
    texto: lineas.join('\n'),
    botones: [...botonesDeEvento(paginaEventos, controles.length), ...controles],
  };
}

function descripcionSinReloj(partido: Partido): string {
  if (partido.tiempoEstado === 'no_iniciado') return 'Sin empezar';

  return partido.tiempoActual >= partido.cantidadTiempos
    ? `Tiempo ${partido.tiempoActual} finalizado (era el último)`
    : `Tiempo ${partido.tiempoActual} finalizado`;
}

/**
 * Los botones de evento de una página, con "Ver más" si sobran.
 *
 * `reservar` son los botones que `panelEnVivo` agrega aparte (los de
 * control, 3 o 4 según el estado del partido): sin descontarlos acá, una
 * página llena de eventos más los controles se pasa de las 10 filas que
 * admite WhatsApp.
 */
export function botonesDeEvento(pagina: number, reservar: number): Boton[] {
  const { botones } = botonesPaginados(
    EVENTOS.map((e) => ({ id: `${PREFIJO_EVENTO}${e.tipo}`, texto: e.boton })),
    pagina,
    reservar,
  );

  return botones;
}

export function botonesDeControl(partido: Partido): Boton[] {
  const botones: Boton[] = [];

  if (partido.tiempoEstado === 'en_curso') {
    botones.push({ id: ID_FINALIZAR_TIEMPO, texto: '⏸️ Fin del tiempo' });
  } else if (partido.tiempoActual < partido.cantidadTiempos) {
    botones.push({ id: ID_FINALIZAR_TIEMPO, texto: `▶️ Tiempo ${partido.tiempoActual + 1}` });
  }

  botones.push(
    { id: ID_DESHACER, texto: '↩️ Deshacer' },
    { id: ID_RESUMEN, texto: '📋 Ver resumen' },
    { id: ID_FINALIZAR_PARTIDO, texto: '🏁 Finalizar' },
  );

  return botones;
}

/**
 * La línea de bitácora que queda en el chat.
 *
 * Es lo que va quedando de crónica del partido —y lo que un papá reenvía al
 * grupo— así que un cambio se cuenta distinto: no hay "un" protagonista, hay
 * quien sale y quien entra.
 */
export function lineaDeBitacora(
  evento: EventoCargado,
  marcador: Marcador,
  equipoNombre: string,
  rival: string,
): string {
  const cuando = evento.minutoCalculado === null ? '' : `, min ${evento.minutoCalculado}`;

  if (evento.tipo === 'cambio') {
    const sale = protagonista(evento, equipoNombre, rival);
    const entra = protagonistaEntra(evento);

    return `🔄 Cambio: sale ${sale}, entra ${entra}${cuando}`;
  }

  const definicion = definicionDe(evento.tipo);
  const quien = protagonista(evento, equipoNombre, rival);
  const resultado = mueveElMarcador(evento.tipo) ? ` — ${marcador.propio}-${marcador.rival}` : '';

  return `${definicion.emoji} ${definicion.sustantivo} de ${quien}${cuando}${resultado}`;
}

function mueveElMarcador(tipo: TipoEvento): boolean {
  return tipo === 'gol' || tipo === 'autogol';
}

function nombrarJugador(nombre: string | null, dorsal: number | null): string | null {
  if (!nombre) return null;

  return dorsal === null ? nombre : `${nombre} #${dorsal}`;
}

/** A quién se le atribuye el evento: el jugador si está identificado, si no el equipo. */
export function protagonista(
  evento: Pick<EventoCargado, 'jugadorNombre' | 'jugadorDorsal' | 'equipoOrigen'>,
  equipoNombre: string,
  rival: string,
): string {
  return (
    nombrarJugador(evento.jugadorNombre, evento.jugadorDorsal) ??
    (evento.equipoOrigen === 'propio' ? equipoNombre : rival)
  );
}

/**
 * Quién entra en un cambio. A diferencia de `protagonista`, no tiene
 * respaldo de equipo: el check de la base exige que siempre esté
 * identificado, así que si no lo está es un dato inconsistente, no un rival
 * sin ficha.
 */
export function protagonistaEntra(
  evento: Pick<EventoCargado, 'jugadorEntraNombre' | 'jugadorEntraDorsal'>,
): string {
  return nombrarJugador(evento.jugadorEntraNombre, evento.jugadorEntraDorsal) ?? 'alguien';
}

export function botonesDeOrigen(equipoNombre: string, rival: string): Boton[] {
  return [
    { id: `${PREFIJO_ORIGEN}propio`, texto: recortar(equipoNombre, 20) },
    { id: `${PREFIJO_ORIGEN}rival`, texto: recortar(rival, 20) },
  ];
}

export function origenDesdeBoton(seleccion: string): EquipoOrigen | null {
  if (seleccion === `${PREFIJO_ORIGEN}propio`) return 'propio';
  if (seleccion === `${PREFIJO_ORIGEN}rival`) return 'rival';

  return null;
}

/** Texto de la advertencia de posible duplicado (RF-3.5). */
export function avisoDeDuplicado(
  reciente: EventoCargado,
  segundos: number,
  equipoNombre: string,
  rival: string,
): string {
  const cuando = reciente.minutoCalculado === null ? '' : `, min ${reciente.minutoCalculado}`;
  const autor = reciente.reportanteNombre ?? 'Alguien';

  const detalle =
    reciente.tipo === 'cambio'
      ? `Cambio: sale ${protagonista(reciente, equipoNombre, rival)}, entra ${protagonistaEntra(reciente)}`
      : `${definicionDe(reciente.tipo).sustantivo} de ${protagonista(reciente, equipoNombre, rival)}${cuando}`;

  return [
    `⚠️ Hace ${segundos} segundos, ${autor} ya registró:`,
    detalle,
    '',
    '¿Lo tuyo es otro evento o es el mismo que ya se cargó?',
  ].join('\n');
}

export function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}
