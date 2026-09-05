import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { botonComando, respuestaSinEquipos } from '../conversacion/comandos';
import { MembresiasService } from '../identidad/membresias.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/partidos';
import { describirFecha } from './fechas';
import { describirMarcador, type Partido } from './partido.mapper';
import { PartidosService } from './partidos.service';

@Injectable()
export class PartidosHandler {
  constructor(
    private readonly membresias: MembresiasService,
    private readonly partidos: PartidosService,
  ) {}

  /** `/partidos` — los últimos partidos de cada equipo del usuario. */
  async listar(usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return respuestaSinEquipos();

    const bloques: string[] = [];

    for (const equipo of equipos) {
      const recientes = await this.partidos.recientesDe(equipo.equipoId);

      const cuerpo =
        recientes.length === 0
          ? textos.listar.sinPartidos()
          : recientes.map((p) => `  ${this.linea(p)}`).join('\n');

      bloques.push(`*${equipo.equipoNombre}*\n${cuerpo}`);
    }

    return {
      texto: bloques.join('\n\n'),
      botones: [botonComando('nuevopartido', textos.listar.botonCrearPartido)],
    };
  }

  private linea(partido: Partido): string {
    const detalle = [describirFecha(partido.fecha), partido.competenciaNombre]
      .filter(Boolean)
      .join(' · ');

    return `${this.simbolo(partido)} vs ${partido.rival} ${describirMarcador(partido)} — ${detalle}`;
  }

  /** Un símbolo por estado: en una lista larga se lee más rápido que la palabra. */
  private simbolo(partido: Partido): string {
    switch (partido.estado) {
      case 'en_progreso':
        return '🔴';
      case 'cerrado':
        return '✅';
      default:
        return '🗓️';
    }
  }
}
