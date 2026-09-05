import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { respuestaSinEquipos } from '../conversacion/comandos';
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

    if (equipos.length === 0) return respuestaSinEquipos();

    // Las consultas de cada equipo son independientes entre sí: en paralelo
    // en vez de una por una, sin cambiar el orden de los bloques resultantes
    // (`Promise.all` conserva el orden de `equipos`).
    const porEquipo = await Promise.all(
      equipos.map(async (equipo) => ({
        equipo,
        stats: await this.estadisticas.deJugador(equipo.equipoId, nombre),
      })),
    );

    const bloques: string[] = [];
    const encontrados: EstadisticaJugador[] = [];

    for (const { equipo, stats } of porEquipo) {
      for (const stat of stats) {
        bloques.push(this.lineaJugador(equipo.equipoNombre, stat));
        encontrados.push(stat);
      }
    }

    if (bloques.length === 0) {
      return {
        texto: textosComunes.noEncontre(`a nadie llamado "${nombre}" con estadísticas cargadas`),
      };
    }

    bloques.push(...this.totalesPorPersona(encontrados));

    return { texto: bloques.join('\n\n') };
  }

  /**
   * Un bloque "Total" por cada persona que apareció con ficha en ≥2 de los
   * equipos del usuario (mismo `personaId`, ver Frente A). Suma solo sobre
   * filas ya traídas con los permisos del propio usuario —nunca con una
   * consulta aparte por persona— para no poder terminar mostrando datos de
   * un equipo al que no tiene acceso, aunque comparta persona con uno de los
   * suyos.
   */
  private totalesPorPersona(encontrados: EstadisticaJugador[]): string[] {
    const porPersona = new Map<string, EstadisticaJugador[]>();

    for (const stat of encontrados) {
      if (!stat.personaId) continue;
      const grupo = porPersona.get(stat.personaId) ?? [];
      grupo.push(stat);
      porPersona.set(stat.personaId, grupo);
    }

    const bloques: string[] = [];

    for (const grupo of porPersona.values()) {
      if (grupo.length < 2) continue;

      bloques.push(
        textos.totalPersona({
          nombre: grupo[0].nombre,
          temporada: grupo[0].temporada,
          equipos: grupo.length,
          partidosConEvento: grupo.reduce((acc, s) => acc + s.partidosConEvento, 0),
          goles: grupo.reduce((acc, s) => acc + s.goles, 0),
          asistencias: grupo.reduce((acc, s) => acc + s.asistencias, 0),
          amarillas: grupo.reduce((acc, s) => acc + s.amarillas, 0),
        }),
      );
    }

    return bloques;
  }

  async tabla(usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return respuestaSinEquipos();

    const bloques: string[] = [];

    for (const equipo of equipos) {
      const stat = await this.estadisticas.deEquipo(equipo.equipoId);
      const goleador = stat ? await this.estadisticas.goleadorDe(equipo.equipoId) : null;

      bloques.push(this.bloqueEquipo(equipo.equipoNombre, stat, goleador));
    }

    return { texto: bloques.join('\n\n') };
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
