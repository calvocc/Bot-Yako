import { Injectable } from '@nestjs/common';
import { EventosService, type EventoCargado } from '../eventos/eventos.service';
import { definicionDe, type TipoEvento } from '../eventos/evento.tipos';
import { protagonista } from '../eventos/mensajes';
import { calcularMvp, describirMvp } from '../eventos/puntaje';
import { describirFecha } from '../partidos/fechas';
import { marcadorDe, type Partido } from '../partidos/partido.mapper';
import { textos } from '../textos/resumen';

export interface DatosResumen {
  partido: Partido;
  equipoNombre: string;
  eventos: EventoCargado[];
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
];

@Injectable()
export class ResumenService {
  constructor(private readonly eventos: EventosService) {}

  async generar(partido: Partido, equipoNombre: string): Promise<string> {
    const cargados = await this.eventos.delPartido(partido.id);

    return componerResumen({ partido, equipoNombre, eventos: cargados });
  }
}

/**
 * El texto que se reenvía al grupo de papás.
 *
 * Se arma aparte del servicio para poder probarlo con eventos armados a mano,
 * sin base de datos: es puro formato y es donde se cuelan los errores.
 */
export function componerResumen({ partido, equipoNombre, eventos }: DatosResumen): string {
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

  if (propios.length === 0) {
    lineas.push(textos.sinEventos());
  } else {
    // Sin eventos no hay a quién destacar; con solo tarjetas, tampoco (M4:
    // hace falta al menos un evento positivo).
    const destacado = calcularMvp(eventos);

    if (destacado) {
      lineas.push('', textos.mvp(describirMvp(destacado)));
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
