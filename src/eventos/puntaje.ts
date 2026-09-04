import type { TipoEvento } from './evento.tipos';
import type { EventoCargado } from './eventos.service';

/**
 * MVP del partido por puntos (M4).
 *
 * "El que más goles hizo" no reconoce al que asistió tres veces sin marcar.
 * Un sistema de puntos por tipo de evento sí, y es lo que decidió la revisión
 * del documento de diseño (docs/revision-documentos.md, M4).
 *
 * La escala vive en un solo lugar para poder ajustarla sin tocar la lógica de
 * cálculo. Si más adelante conviene que cada academia use la suya, pasa a ser
 * una columna de `academias` sin cambiar nada más de este archivo.
 */
export const PUNTOS: Record<TipoEvento, number> = {
  gol: 3,
  asistencia: 2,
  tarjeta_amarilla: -1,
  tarjeta_roja: -3,
  autogol: -3,
  cambio: 0,
};

export interface JugadorDestacado {
  jugadorId: string;
  nombre: string;
  dorsal: number | null;
  puntos: number;
  goles: number;
  asistencias: number;
  amarillas: number;
  rojas: number;
  autogoles: number;
}

/**
 * Calcula el jugador destacado del partido.
 *
 * Solo entran jugadores del equipo propio con ficha identificada: un gol o
 * autogol del rival no tiene jugador propio detrás, y una tarjeta o
 * asistencia del rival no se carga (ver `admiteEquipoRival`). Se exige
 * puntaje neto positivo, no solo "algún evento positivo": una asistencia
 * seguida de una roja da neto negativo, y elegirlo MVP igual sería premiar
 * a alguien peor que nadie en el partido donde solo hubo tarjetas.
 */
export function calcularMvp(eventos: readonly EventoCargado[]): JugadorDestacado | null {
  const acumulados = new Map<string, JugadorDestacado>();

  for (const evento of eventos) {
    if (evento.equipoOrigen !== 'propio' || !evento.jugadorId) continue;

    const actual = acumulados.get(evento.jugadorId) ?? {
      jugadorId: evento.jugadorId,
      nombre: evento.jugadorNombre ?? 'Sin nombre',
      dorsal: evento.jugadorDorsal,
      puntos: 0,
      goles: 0,
      asistencias: 0,
      amarillas: 0,
      rojas: 0,
      autogoles: 0,
    };

    actual.puntos += PUNTOS[evento.tipo];

    switch (evento.tipo) {
      case 'gol':
        actual.goles += 1;
        break;
      case 'asistencia':
        actual.asistencias += 1;
        break;
      case 'tarjeta_amarilla':
        actual.amarillas += 1;
        break;
      case 'tarjeta_roja':
        actual.rojas += 1;
        break;
      case 'autogol':
        actual.autogoles += 1;
        break;
      case 'cambio':
        break;
    }

    acumulados.set(evento.jugadorId, actual);
  }

  const candidatos = [...acumulados.values()].filter((c) => c.puntos > 0);

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.goles !== a.goles) return b.goles - a.goles;
    if (b.asistencias !== a.asistencias) return b.asistencias - a.asistencias;

    // Menor dorsal desempata; sin dorsal queda de último.
    if (a.dorsal === null) return b.dorsal === null ? 0 : 1;
    if (b.dorsal === null) return -1;

    return a.dorsal - b.dorsal;
  });

  return candidatos[0];
}

/** "Jacob (8 pts — 2 goles, 1 asistencia)". Solo lista lo que sumó o restó. */
export function describirMvp(destacado: JugadorDestacado): string {
  const detalle = [
    contarSi(destacado.goles, 'gol', 'goles'),
    contarSi(destacado.asistencias, 'asistencia', 'asistencias'),
    contarSi(destacado.amarillas, 'amarilla', 'amarillas'),
    contarSi(destacado.rojas, 'roja', 'rojas'),
    contarSi(destacado.autogoles, 'autogol', 'autogoles'),
  ].filter((linea): linea is string => linea !== null);

  const resumen = detalle.length > 0 ? ` — ${detalle.join(', ')}` : '';

  return `${destacado.nombre} (${destacado.puntos} pts${resumen})`;
}

function contarSi(cantidad: number, singular: string, plural: string): string | null {
  if (cantidad === 0) return null;

  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}
