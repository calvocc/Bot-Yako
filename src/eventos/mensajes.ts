import type { Boton } from '../channels/channel.types';
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
}

/**
 * El panel de carga en vivo.
 *
 * Es un solo mensaje que se edita en el sitio en vez de uno nuevo por
 * interacción: durante un partido, veinte paneles apilados hacen que nadie
 * encuentre el de arriba.
 */
export function panelEnVivo(estado: EstadoPanel): { texto: string; botones: Boton[] } {
  const { partido, equipoNombre, minuto, aviso } = estado;

  const encabezado = `⚡ ${equipoNombre} vs ${partido.rival}`;
  const reloj =
    partido.tiempoEstado === 'en_curso'
      ? `Tiempo ${partido.tiempoActual} · min ${describirMinuto(minuto)}`
      : descripcionSinReloj(partido);

  const lineas = [aviso, encabezado, `${reloj} · ${describirMarcador(partido)}`].filter(Boolean);

  return {
    texto: lineas.join('\n'),
    botones: [...botonesDeEvento(), ...botonesDeControl(partido)],
  };
}

function descripcionSinReloj(partido: Partido): string {
  if (partido.tiempoEstado === 'no_iniciado') return 'Sin empezar';

  return partido.tiempoActual >= partido.cantidadTiempos
    ? `Tiempo ${partido.tiempoActual} finalizado (era el último)`
    : `Tiempo ${partido.tiempoActual} finalizado`;
}

export function botonesDeEvento(): Boton[] {
  return EVENTOS.map((e) => ({ id: `${PREFIJO_EVENTO}${e.tipo}`, texto: e.boton }));
}

function botonesDeControl(partido: Partido): Boton[] {
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
 * El panel se edita en el sitio, así que sin esto el chat no guardaría rastro
 * de lo que pasó y un papá no tendría nada que reenviar al grupo hasta el
 * final del partido.
 */
export function lineaDeBitacora(
  evento: EventoCargado,
  marcador: Marcador,
  equipoNombre: string,
  rival: string,
): string {
  const definicion = definicionDe(evento.tipo);
  const quien = protagonista(evento, equipoNombre, rival);
  const cuando = evento.minutoCalculado === null ? '' : `, min ${evento.minutoCalculado}`;
  const resultado = mueveElMarcador(evento.tipo) ? ` — ${marcador.propio}-${marcador.rival}` : '';

  return `${definicion.emoji} ${definicion.sustantivo} de ${quien}${cuando}${resultado}`;
}

function mueveElMarcador(tipo: TipoEvento): boolean {
  return tipo === 'gol' || tipo === 'autogol';
}

/** A quién se le atribuye el evento: el jugador si está identificado, si no el equipo. */
export function protagonista(
  evento: Pick<EventoCargado, 'jugadorNombre' | 'jugadorDorsal' | 'equipoOrigen'>,
  equipoNombre: string,
  rival: string,
): string {
  if (!evento.jugadorNombre) {
    return evento.equipoOrigen === 'propio' ? equipoNombre : rival;
  }

  return evento.jugadorDorsal === null
    ? evento.jugadorNombre
    : `${evento.jugadorNombre} #${evento.jugadorDorsal}`;
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
  const definicion = definicionDe(reciente.tipo);
  const quien = protagonista(reciente, equipoNombre, rival);
  const cuando = reciente.minutoCalculado === null ? '' : `, min ${reciente.minutoCalculado}`;
  const autor = reciente.reportanteNombre ?? 'Alguien';

  return [
    `⚠️ Hace ${segundos} segundos, ${autor} ya registró:`,
    `${definicion.sustantivo} de ${quien}${cuando}`,
    '',
    '¿Lo tuyo es otro evento o es el mismo que ya se cargó?',
  ].join('\n');
}

export function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}
