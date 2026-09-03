import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { botonComando } from '../conversacion/comandos';
import { MembresiasService } from '../identidad/membresias.service';
import {
  EstadisticasService,
  temporadaActual,
  type EstadisticaEquipo,
  type EstadisticaJugador,
  type Goleador,
} from './estadisticas.service';

const SIN_EQUIPOS: RespuestaBot = {
  texto: 'Todavía no perteneces a ningún equipo.',
  botones: [botonComando('start', 'Empezar')],
};

/**
 * `/stats [jugador]` y `/tabla` (RF-6). Cualquier rol puede usarlos —Viewer
 * incluido (RF-6.3)—, así que resuelven el equipo igual que `/partidos`: sin
 * `rolMinimo` y un bloque por cada equipo del usuario, en vez de preguntar
 * cuál (es una consulta, no hay nada que "elegir" para actuar).
 */
@Injectable()
export class EstadisticasHandler {
  constructor(
    private readonly membresias: MembresiasService,
    private readonly estadisticas: EstadisticasService,
  ) {}

  async stats(argumento: string | undefined, usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: 'Primero usa /start.' };

    const nombre = argumento?.trim();

    if (!nombre) {
      return {
        texto: '¿De qué jugador? Escribe /stats seguido del nombre, por ejemplo: /stats Jacob',
      };
    }

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return SIN_EQUIPOS;

    const bloques: string[] = [];

    for (const equipo of equipos) {
      const encontrados = await this.estadisticas.deJugador(equipo.equipoId, nombre);

      for (const stat of encontrados) {
        bloques.push(this.lineaJugador(equipo.equipoNombre, stat));
      }
    }

    if (bloques.length === 0) {
      return { texto: `No encontré a nadie llamado "${nombre}" con estadísticas cargadas.` };
    }

    return { texto: bloques.join('\n\n') };
  }

  async tabla(usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: 'Primero usa /start.' };

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return SIN_EQUIPOS;

    const bloques: string[] = [];

    for (const equipo of equipos) {
      const stat = await this.estadisticas.deEquipo(equipo.equipoId);
      const goleador = stat ? await this.estadisticas.goleadorDe(equipo.equipoId) : null;

      bloques.push(this.bloqueEquipo(equipo.equipoNombre, stat, goleador));
    }

    return { texto: bloques.join('\n\n') };
  }

  private lineaJugador(equipoNombre: string, stat: EstadisticaJugador): string {
    const dorsal = stat.dorsal !== null ? ` #${stat.dorsal}` : '';

    return [
      `📊 ${stat.nombre}${dorsal} — ${equipoNombre} · temporada ${stat.temporada}`,
      `Partidos jugados: ${stat.partidosConEvento}`,
      `Goles: ${stat.goles}  ·  Asistencias: ${stat.asistencias}  ·  Amarillas: ${stat.amarillas}`,
    ].join('\n');
  }

  private bloqueEquipo(
    equipoNombre: string,
    stat: EstadisticaEquipo | null,
    goleador: Goleador | null,
  ): string {
    if (!stat) {
      return `📋 ${equipoNombre} — temporada ${temporadaActual()}\nSin partidos cerrados todavía.`;
    }

    const perdidos = stat.perdidos === 1 ? '1 perdido' : `${stat.perdidos} perdidos`;
    const golLinea = goleador ? ` · Goleador: ${goleador.nombre} (${goleador.goles})` : '';

    return [
      `📋 ${equipoNombre} — temporada ${stat.temporada}`,
      `${stat.partidosJugados} partidos · ${stat.ganados} ganados · ${stat.empatados} empates · ${perdidos}`,
      `Goles a favor: ${stat.golesFavor}${golLinea}`,
    ].join('\n');
  }
}
