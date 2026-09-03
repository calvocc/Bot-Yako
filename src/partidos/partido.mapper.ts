import type { partidos } from '../db/schema';

export type EstadoPartido = 'pendiente' | 'en_progreso' | 'cerrado';
export type EstadoTiempo = 'no_iniciado' | 'en_curso' | 'finalizado';
export type ModoCarga = 'en_vivo' | 'post_partido';

export interface Partido {
  id: string;
  equipoId: string;
  rival: string;
  /** `yyyy-mm-dd`: el día que se jugó, sin hora. */
  fecha: string;
  competencia: string | null;
  cantidadTiempos: number;
  minutosPorTiempo: number;
  modoCarga: ModoCarga | null;
  estado: EstadoPartido;
  tiempoActual: number;
  tiempoEstado: EstadoTiempo;
  tiempoIniciadoEn: Date | null;
  marcadorPropio: number;
  marcadorRival: number;
  marcadorPropioConfirmado: number | null;
  marcadorRivalConfirmado: number | null;
  iniciadoPor: string | null;
  creadoPor: string;
  cerradoEn: Date | null;
  cerradoPor: string | null;
}

export function mapearPartido(fila: typeof partidos.$inferSelect): Partido {
  return {
    id: fila.id,
    equipoId: fila.equipoId,
    rival: fila.rival,
    fecha: fila.fecha,
    competencia: fila.competencia,
    cantidadTiempos: fila.cantidadTiempos,
    minutosPorTiempo: fila.minutosPorTiempo,
    modoCarga: fila.modoCarga,
    estado: fila.estado,
    tiempoActual: fila.tiempoActual,
    tiempoEstado: fila.tiempoEstado,
    tiempoIniciadoEn: fila.tiempoIniciadoEn,
    marcadorPropio: fila.marcadorPropio,
    marcadorRival: fila.marcadorRival,
    marcadorPropioConfirmado: fila.marcadorPropioConfirmado,
    marcadorRivalConfirmado: fila.marcadorRivalConfirmado,
    iniciadoPor: fila.iniciadoPor,
    creadoPor: fila.creadoPor,
    cerradoEn: fila.cerradoEn,
    cerradoPor: fila.cerradoPor,
  };
}

/** El marcador que se muestra: el confirmado al cerrar gana sobre el derivado (C5). */
export function marcadorDe(partido: Partido): { propio: number; rival: number } {
  return {
    propio: partido.marcadorPropioConfirmado ?? partido.marcadorPropio,
    rival: partido.marcadorRivalConfirmado ?? partido.marcadorRival,
  };
}

export function describirMarcador(partido: Partido): string {
  const { propio, rival } = marcadorDe(partido);
  return `${propio}-${rival}`;
}
