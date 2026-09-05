import { Injectable } from '@nestjs/common';
import { EventosService, type EventoCargado } from '../eventos/eventos.service';
import { definicionDe, type TipoEvento } from '../eventos/evento.tipos';
import { protagonista } from '../eventos/mensajes';
import {
  calcularNotas,
  describirMvp,
  esDestacable,
  type Bono,
  type JugadorParticipante,
} from '../eventos/puntaje';
import { JugadoresService, type Jugador } from '../jugadores/jugadores.service';
import { AlineacionService } from '../partidos/alineacion.service';
import { describirFecha } from '../partidos/fechas';
import { marcadorDe, type Partido } from '../partidos/partido.mapper';
import { TiemposService } from '../partidos/tiempos.service';
import { textos } from '../textos/resumen';

export interface DatosResumen {
  partido: Partido;
  equipoNombre: string;
  eventos: EventoCargado[];
  /** Titulares + cambios: para que aparezcan con nota aunque no hayan tenido ningún evento. */
  participantes?: JugadorParticipante[];
  /** Bonos de cierre (valla invicta, goles recibidos): ver `ResumenService.bonosDesde`. */
  bonos?: Bono[];
}

/**
 * Orden en que se listan los grupos. Fijo, para que el resumen se lea siempre
 * igual sin importar en qué orden se cargaron los eventos.
 */
const ORDEN: readonly TipoEvento[] = [
  'gol',
  'autogol',
  'asistencia',
  'tarjeta_amarilla',
  'tarjeta_roja',
  'cambio',
  'recuperacion',
  'rechazo',
  'regate',
  'tiro_al_arco',
  'falta_recibida',
  'atajada',
  'penal_atajado',
];

/** Un arquero o defensa necesita al menos este porcentaje de los minutos jugados para el bono de cierre. */
const PORCENTAJE_MINIMO_BONO = 0.6;
const PUNTOS_VALLA_INVICTA = 3;
/** Se resta 1 por cada 2 goles recibidos (redondeando hacia abajo: 1 gol no cuesta nada). */
const GOLES_POR_PUNTO_PENALIZADO = 2;

@Injectable()
export class ResumenService {
  constructor(
    private readonly eventos: EventosService,
    private readonly alineacion: AlineacionService,
    private readonly tiempos: TiemposService,
    private readonly jugadores: JugadoresService,
  ) {}

  async generar(partido: Partido, equipoNombre: string): Promise<string> {
    // La plantilla y el minuto final se piden una sola vez acá, en paralelo
    // con los eventos -- son independientes entre sí, y el minuto final hace
    // falta antes de poder pedir minutos jugados.
    const [cargados, plantilla, contexto] = await Promise.all([
      this.eventos.delPartido(partido.id),
      this.jugadores.listar(partido.equipoId, true),
      this.tiempos.contextoDeCarga(partido),
    ]);

    const minutoFinal = contexto.minuto.minuto;
    // Una sola consulta de titulares/cambios para las dos cosas que salen de
    // ahí (participantes y minutos jugados): antes eran dos SELECT de cada
    // una, uno por `participantesDe` y otro por `minutosJugadosDe`.
    const { participantes: ids, minutos } = await this.alineacion.datosDeParticipacion(
      partido.id,
      minutoFinal,
    );

    const porId = new Map(plantilla.map((j) => [j.id, j]));
    const participantes = this.participantesDesde(ids, porId);
    const bonos = this.bonosDesde(partido, minutoFinal, minutos, porId);

    return componerResumen({ partido, equipoNombre, eventos: cargados, participantes, bonos });
  }

  /**
   * Ids de participantes → nombre/dorsal/posición, lo que `calcularNotas`
   * necesita para mostrar a todos, no solo a quien tuvo algún evento.
   */
  private participantesDesde(
    ids: readonly string[],
    porId: ReadonlyMap<string, Jugador>,
  ): JugadorParticipante[] {
    // Un id sin ficha en la plantilla es un dato inconsistente (la FK lo
    // impide en la práctica); se descarta en vez de listar "Sin nombre".
    return ids
      .map((id) => porId.get(id))
      .filter((j): j is NonNullable<typeof j> => j !== undefined)
      .map((j) => ({ jugadorId: j.id, nombre: j.nombre, dorsal: j.dorsal, posicion: j.posicion }));
  }

  /**
   * Bono de cierre para arqueros/defensas que jugaron al menos el 60% de
   * los minutos: +3 por valla invicta, -1 cada 2 goles recibidos. Sin
   * minutos jugados (partido que no arrancó de verdad, o sin titulares
   * registrados) no hay a quién dárselo -- un umbral de 0 haría "elegible"
   * a cualquiera.
   */
  private bonosDesde(
    partido: Partido,
    minutoFinal: number,
    minutos: ReadonlyMap<string, number>,
    porId: ReadonlyMap<string, Jugador>,
  ): Bono[] {
    if (minutoFinal <= 0 || minutos.size === 0) return [];

    const { rival } = marcadorDe(partido);
    const puntos =
      (rival === 0 ? PUNTOS_VALLA_INVICTA : 0) - Math.floor(rival / GOLES_POR_PUNTO_PENALIZADO);

    if (puntos === 0) return [];

    const umbral = minutoFinal * PORCENTAJE_MINIMO_BONO;

    return [...minutos.entries()]
      .filter(([, jugados]) => jugados >= umbral)
      .filter(([jugadorId]) => {
        const posicion = porId.get(jugadorId)?.posicion;

        return posicion === 'arquero' || posicion === 'defensa';
      })
      .map(([jugadorId]) => ({ jugadorId, puntos }));
  }
}

/**
 * El texto que se reenvía al grupo de papás.
 *
 * Se arma aparte del servicio para poder probarlo con eventos armados a mano,
 * sin base de datos: es puro formato y es donde se cuelan los errores.
 */
export function componerResumen({
  partido,
  equipoNombre,
  eventos,
  participantes = [],
  bonos = [],
}: DatosResumen): string {
  const marcador = marcadorDe(partido);
  const encabezado = `🏆 ${equipoNombre}  ${marcador.propio} - ${marcador.rival}  ${partido.rival}`;

  const contexto = [partido.competenciaNombre, describirFecha(partido.fecha)]
    .filter(Boolean)
    .join(' · ');

  const lineas = [encabezado, contexto].filter(Boolean);

  const propios = eventos.filter((e) => e.equipoOrigen === 'propio');

  for (const tipo of ORDEN) {
    const delTipo = propios.filter((e) => e.tipo === tipo);

    if (delTipo.length === 0) continue;

    const definicion = definicionDe(tipo);
    const detalle = delTipo.map((e) => describirEvento(e, equipoNombre, partido.rival)).join(', ');

    lineas.push(`${definicion.emoji} ${definicion.sustantivo}: ${detalle}`);
  }

  if (propios.length === 0 && participantes.length === 0) {
    lineas.push(textos.sinEventos());
  } else {
    // calcularMvp no hace falta acá: es solo notas[0], y llamarlo aparte
    // recorrería y ordenaría el mismo acumulado dos veces.
    const notas = calcularNotas(eventos, participantes, bonos);
    const destacado = notas[0];

    if (esDestacable(destacado)) {
      lineas.push('', textos.mvp(describirMvp(destacado)));
    }

    if (notas.length > 0) {
      lineas.push('', textos.notas.encabezado());

      for (const nota of notas) {
        lineas.push(textos.notas.linea(nota.nombre, nota.dorsal, nota.nota));
      }
    }
  }

  if (partido.estado !== 'cerrado') {
    lineas.push('', textos.partidoAbierto());
  }

  return lineas.join('\n');
}

/**
 * "Jacob '23" — el apóstrofo es la convención futbolística para el minuto.
 *
 * Un cambio no tiene "un" protagonista: hay quien sale y quien entra, así que
 * se cuenta con los dos, igual que ya hace la bitácora en vivo (`mensajes.ts`).
 */
function describirEvento(evento: EventoCargado, equipoNombre: string, rival: string): string {
  const cuando = evento.minutoCalculado === null ? '' : ` '${evento.minutoCalculado}`;

  if (evento.tipo === 'cambio') {
    const sale = evento.jugadorNombre ?? protagonista(evento, equipoNombre, rival);
    // Sin dorsal, igual que `quien` más abajo: el resumen no lo muestra en
    // ningún otro evento, así que un cambio tampoco debería ser la excepción.
    const entra = evento.jugadorEntraNombre ?? 'alguien';

    return `${sale} → ${entra}${cuando}`;
  }

  const quien = evento.jugadorNombre ?? protagonista(evento, equipoNombre, rival);

  return `${quien}${cuando}`;
}
