import type { tipoEventoEnum } from '../db/schema/enums';

export type TipoEvento = (typeof tipoEventoEnum.enumValues)[number];
export type EquipoOrigen = 'propio' | 'rival';

export interface DefinicionEvento {
  tipo: TipoEvento;
  emoji: string;
  /** Rótulo del botón. ≤ 20 caracteres por el límite de WhatsApp. */
  boton: string;
  /** Cómo se nombra en una frase: "Gol de Jacob". */
  sustantivo: string;
  /** Un evento del rival sin ficha de jugador se atribuye al equipo. */
  admiteRival: boolean;
}

/**
 * Los eventos que ofrece el panel, en el orden en que aparecen.
 *
 * El orden no es decorativo: en un partido se cargan goles todo el tiempo y
 * cambios casi nunca, y el primer botón es el que se acierta sin mirar.
 */
export const EVENTOS: readonly DefinicionEvento[] = [
  { tipo: 'gol', emoji: '⚽', boton: '⚽ Gol', sustantivo: 'Gol', admiteRival: true },
  {
    tipo: 'asistencia',
    emoji: '🅰️',
    boton: '🅰️ Asistencia',
    sustantivo: 'Asistencia',
    admiteRival: false,
  },
  {
    tipo: 'tarjeta_amarilla',
    emoji: '🟨',
    boton: '🟨 Amarilla',
    sustantivo: 'Amarilla',
    admiteRival: false,
  },
  {
    tipo: 'tarjeta_roja',
    emoji: '🟥',
    boton: '🟥 Roja',
    sustantivo: 'Roja',
    admiteRival: false,
  },
  { tipo: 'autogol', emoji: '🙃', boton: '🙃 Autogol', sustantivo: 'Autogol', admiteRival: true },
  { tipo: 'cambio', emoji: '🔄', boton: '🔄 Cambio', sustantivo: 'Cambio', admiteRival: false },
];

export function definicionDe(tipo: TipoEvento): DefinicionEvento {
  const definicion = EVENTOS.find((e) => e.tipo === tipo);

  if (!definicion) {
    throw new Error(`Tipo de evento sin definición: ${tipo}`);
  }

  return definicion;
}

export function esTipoDeEvento(valor: string): valor is TipoEvento {
  return EVENTOS.some((e) => e.tipo === valor);
}

/**
 * Los eventos que sí tiene sentido atribuir al rival.
 *
 * Una amarilla del rival no aporta nada a las estadísticas del equipo propio y
 * obligaría a pedir "¿de qué equipo?" en cada tarjeta. Los goles sí, porque sin
 * ellos el marcador no cuadra.
 */
export function admiteEquipoRival(tipo: TipoEvento): boolean {
  return definicionDe(tipo).admiteRival;
}
