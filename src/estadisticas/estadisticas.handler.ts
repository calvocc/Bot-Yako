import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { botonComando } from '../conversacion/comandos';
import { MembresiasService } from '../identidad/membresias.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/estadisticas';
import {
  EstadisticasService,
  temporadaActual,
  type EstadisticaEquipo,
  type EstadisticaJugador,
  type Goleador,
} from './estadisticas.service';

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
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const nombre = argumento?.trim();

    if (!nombre) {
      return { texto: textos.preguntaJugador() };
    }

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return this.sinEquipos();

    const bloques: string[] = [];

    for (const equipo of equipos) {
      const encontrados = await this.estadisticas.deJugador(equipo.equipoId, nombre);

      for (const stat of encontrados) {
        bloques.push(this.lineaJugador(equipo.equipoNombre, stat));
      }
    }

    if (bloques.length === 0) {
      return {
        texto: textosComunes.noEncontre(`a nadie llamado "${nombre}" con estadísticas cargadas`),
      };
    }

    return { texto: bloques.join('\n\n') };
  }

  async tabla(usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return this.sinEquipos();

    const bloques: string[] = [];

    for (const equipo of equipos) {
      const stat = await this.estadisticas.deEquipo(equipo.equipoId);
      const goleador = stat ? await this.estadisticas.goleadorDe(equipo.equipoId) : null;

      bloques.push(this.bloqueEquipo(equipo.equipoNombre, stat, goleador));
    }

    return { texto: bloques.join('\n\n') };
  }

  private sinEquipos(): RespuestaBot {
    return {
      texto: textosComunes.sinEquipos(),
      botones: [botonComando('start', textosComunes.botonEmpezar())],
    };
  }

  private lineaJugador(equipoNombre: string, stat: EstadisticaJugador): string {
    return textos.lineaJugador({
      nombre: stat.nombre,
      dorsal: stat.dorsal,
      equipoNombre,
      temporada: stat.temporada,
      partidosConEvento: stat.partidosConEvento,
      goles: stat.goles,
      asistencias: stat.asistencias,
      amarillas: stat.amarillas,
    });
  }

  private bloqueEquipo(
    equipoNombre: string,
    stat: EstadisticaEquipo | null,
    goleador: Goleador | null,
  ): string {
    if (!stat) {
      return textos.sinPartidosCerrados(equipoNombre, temporadaActual());
    }

    return textos.bloqueEquipo({
      equipoNombre,
      temporada: stat.temporada,
      partidosJugados: stat.partidosJugados,
      ganados: stat.ganados,
      empatados: stat.empatados,
      perdidos: stat.perdidos,
      golesFavor: stat.golesFavor,
      goleador,
    });
  }
}
