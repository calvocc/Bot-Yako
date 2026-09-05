import type { Posicion } from '../jugadores/posicion';
import type { TipoEvento } from './evento.tipos';
import type { EventoCargado } from './eventos.service';

/**
 * Nota por partido (0–10), reemplaza al sistema de puntos del MVP (M4).
 *
 * "El que más goles hizo" no reconoce al que recuperó diez balones sin
 * anotar nunca, y un sistema de un solo destacado por partido deja a todos
 * los demás sin ningún número. El diseño (conversación con el usuario,
 * inspirado en Fantasy Premier League y en WhoScored/Sofascore) reemplaza
 * los dos: todos arrancan de una nota base y suman o restan desde ahí según
 * lo que hicieron, y el destacado es simplemente quien terminó con la nota
 * más alta.
 *
 * `PUNTOS_EVENTO`/`PUNTOS_GOL_POR_POSICION` son puntos brutos, sin acotar
 * -- pequeños a propósito, porque lo que los acota al rango 0–10 es
 * `notaDesde`, no la escala misma. Viven en un solo lugar para poder
 * ajustarlos sin tocar la lógica de cálculo, mismo espíritu que ya tenía
 * este archivo con el sistema anterior.
 */
export const PUNTOS_EVENTO: Record<Exclude<TipoEvento, 'gol'>, number> = {
  asistencia: 2,
  recuperacion: 0.5,
  rechazo: 0.5,
  regate: 0.5,
  tiro_al_arco: 0.5,
  falta_recibida: 0.3,
  atajada: 1,
  penal_atajado: 4,
  tarjeta_amarilla: -1,
  tarjeta_roja: -3,
  autogol: -3,
  cambio: 0,
};

/**
 * El gol vale distinto según la posición de quien lo hizo (mismo criterio
 * que Fantasy Premier League: compensa que un defensor rara vez anota).
 * Sin posición cargada vale lo mismo que valía cualquier gol con el sistema
 * anterior -- no penaliza a quien no pasó por /editarjugador.
 */
export const PUNTOS_GOL_POR_POSICION: Record<Posicion, number> = {
  arquero: 5,
  defensa: 5,
  mediocampista: 4,
  delantero: 3,
};
const PUNTOS_GOL_SIN_POSICION = 3;

/** Bono de cierre de partido (valla invicta / goles recibidos), calculado en `ResumenService`. */
export interface Bono {
  jugadorId: string;
  puntos: number;
}

/** Para que aparezca en la nota aunque no haya tenido ningún evento. */
export interface JugadorParticipante {
  jugadorId: string;
  nombre: string;
  dorsal: number | null;
  posicion: Posicion | null;
}

export interface NotaJugador {
  jugadorId: string;
  nombre: string;
  dorsal: number | null;
  posicion: Posicion | null;
  /** Puntos sin acotar, solo para desempatar -- lo que se muestra es `nota`. */
  puntosBrutos: number;
  nota: number;
  goles: number;
  asistencias: number;
  amarillas: number;
  rojas: number;
  autogoles: number;
  recuperaciones: number;
  rechazos: number;
  regates: number;
  tirosAlArco: number;
  faltasRecibidas: number;
  atajadas: number;
  penalesAtajados: number;
}

/** Techo de puntos brutos que corresponde a la nota máxima (10). Ajustable sin tocar el resto. */
export const TECHO = 8;
const NOTA_BASE = 6;
const NOTA_MIN = 0;
const NOTA_MAX = 10;
/** Cuánto se mueve la nota por cada techo completo de puntos brutos, en cualquier dirección. */
const RANGO_NOTA = 4;

/** `nota = mín(10, máx(0, 6 + (puntos_brutos / TECHO) × 4))`. */
export function notaDesde(puntosBrutos: number): number {
  const nota = NOTA_BASE + (puntosBrutos / TECHO) * RANGO_NOTA;

  return Math.min(NOTA_MAX, Math.max(NOTA_MIN, nota));
}

/**
 * La nota de todos los que jugaron, de mayor a menor.
 *
 * Sembrada con `participantes` (titulares + cambios) para que aparezca
 * hasta quien no tuvo ningún evento, con la nota base. Los eventos del
 * equipo propio con jugador identificado se acumulan encima; los `bonos`
 * de cierre (valla invicta, goles recibidos) se suman al final, por
 * jugador. `puntaje.ts` no toca la base de datos: participantes y bonos
 * los arma `ResumenService`.
 */
export function calcularNotas(
  eventos: readonly EventoCargado[],
  participantes: readonly JugadorParticipante[] = [],
  bonos: readonly Bono[] = [],
): NotaJugador[] {
  const acumulados = new Map<string, NotaJugador>();

  const asegurar = (
    jugadorId: string,
    datos: { nombre: string; dorsal: number | null; posicion: Posicion | null },
  ): NotaJugador => {
    const existente = acumulados.get(jugadorId);

    if (existente) return existente;

    const nuevo: NotaJugador = {
      jugadorId,
      nombre: datos.nombre,
      dorsal: datos.dorsal,
      posicion: datos.posicion,
      puntosBrutos: 0,
      nota: NOTA_BASE,
      goles: 0,
      asistencias: 0,
      amarillas: 0,
      rojas: 0,
      autogoles: 0,
      recuperaciones: 0,
      rechazos: 0,
      regates: 0,
      tirosAlArco: 0,
      faltasRecibidas: 0,
      atajadas: 0,
      penalesAtajados: 0,
    };

    acumulados.set(jugadorId, nuevo);

    return nuevo;
  };

  for (const participante of participantes) {
    asegurar(participante.jugadorId, participante);
  }

  for (const evento of eventos) {
    if (evento.equipoOrigen !== 'propio' || !evento.jugadorId) continue;

    const actual = asegurar(evento.jugadorId, {
      nombre: evento.jugadorNombre ?? 'Sin nombre',
      dorsal: evento.jugadorDorsal,
      posicion: evento.jugadorPosicion,
    });

    // Un evento puede llegar con la posición actual del jugador aunque se
    // haya sembrado antes (por `participantes`) sin ella, o al revés: se
    // toma la que venga con dato, sin pisar una posición conocida con null.
    if (actual.posicion === null && evento.jugadorPosicion !== null) {
      actual.posicion = evento.jugadorPosicion;
    }

    actual.puntosBrutos +=
      evento.tipo === 'gol' ? puntosGol(evento.jugadorPosicion) : PUNTOS_EVENTO[evento.tipo];

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
      case 'recuperacion':
        actual.recuperaciones += 1;
        break;
      case 'rechazo':
        actual.rechazos += 1;
        break;
      case 'regate':
        actual.regates += 1;
        break;
      case 'tiro_al_arco':
        actual.tirosAlArco += 1;
        break;
      case 'falta_recibida':
        actual.faltasRecibidas += 1;
        break;
      case 'atajada':
        actual.atajadas += 1;
        break;
      case 'penal_atajado':
        actual.penalesAtajados += 1;
        break;
      case 'cambio':
        break;
    }
  }

  for (const bono of bonos) {
    // Un bono de alguien que no está entre `participantes` ni tuvo eventos
    // no tiene nombre/dorsal con qué crearse: se descarta en vez de
    // aparecer como "Sin nombre" en el listado.
    const existente = acumulados.get(bono.jugadorId);

    if (existente) existente.puntosBrutos += bono.puntos;
  }

  const lista = [...acumulados.values()];

  for (const jugador of lista) {
    jugador.nota = notaDesde(jugador.puntosBrutos);
  }

  lista.sort((a, b) => {
    if (b.nota !== a.nota) return b.nota - a.nota;
    if (b.puntosBrutos !== a.puntosBrutos) return b.puntosBrutos - a.puntosBrutos;
    if (b.goles !== a.goles) return b.goles - a.goles;
    if (b.asistencias !== a.asistencias) return b.asistencias - a.asistencias;

    // Menor dorsal desempata; sin dorsal queda de último.
    if (a.dorsal === null) return b.dorsal === null ? 0 : 1;
    if (b.dorsal === null) return -1;

    return a.dorsal - b.dorsal;
  });

  return lista;
}

function puntosGol(posicion: Posicion | null): number {
  return posicion === null ? PUNTOS_GOL_SIN_POSICION : PUNTOS_GOL_POR_POSICION[posicion];
}

/** El destacado del partido: quien terminó con la nota más alta. */
export function calcularMvp(
  eventos: readonly EventoCargado[],
  participantes: readonly JugadorParticipante[] = [],
  bonos: readonly Bono[] = [],
): NotaJugador | null {
  return calcularNotas(eventos, participantes, bonos)[0] ?? null;
}

/** "Jacob (8.5) — 2 goles, 1 asistencia". Solo lista lo que sumó o restó. */
export function describirMvp(destacado: NotaJugador): string {
  const detalle = [
    contarSi(destacado.goles, 'gol', 'goles'),
    contarSi(destacado.asistencias, 'asistencia', 'asistencias'),
    contarSi(destacado.atajadas, 'atajada', 'atajadas'),
    contarSi(destacado.penalesAtajados, 'penal atajado', 'penales atajados'),
    contarSi(destacado.recuperaciones, 'recuperación', 'recuperaciones'),
    contarSi(destacado.rechazos, 'rechazo', 'rechazos'),
    contarSi(destacado.regates, 'regate', 'regates'),
    contarSi(destacado.tirosAlArco, 'tiro al arco', 'tiros al arco'),
    contarSi(destacado.faltasRecibidas, 'falta recibida', 'faltas recibidas'),
    contarSi(destacado.amarillas, 'amarilla', 'amarillas'),
    contarSi(destacado.rojas, 'roja', 'rojas'),
    contarSi(destacado.autogoles, 'autogol', 'autogoles'),
  ].filter((linea): linea is string => linea !== null);

  const resumen = detalle.length > 0 ? ` — ${detalle.join(', ')}` : '';

  return `${destacado.nombre} (${destacado.nota.toFixed(1)})${resumen}`;
}

function contarSi(cantidad: number, singular: string, plural: string): string | null {
  if (cantidad === 0) return null;

  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}
