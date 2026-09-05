import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { respuestaSinEquipos } from '../conversacion/comandos';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import { MembresiasService } from '../identidad/membresias.service';
import { formatearListaJugadores, JugadoresService } from '../jugadores/jugadores.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/estadisticas';
import {
  EstadisticasService,
  temporadaActual,
  type EstadisticaEquipo,
  type EstadisticaEquipoCompetencia,
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
    private readonly jugadores: JugadoresService,
    private readonly estadisticas: EstadisticasService,
  ) {}

  async stats(argumento: string | undefined, usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return respuestaSinEquipos();

    const nombre = argumento?.trim();

    return nombre ? this.buscarJugador(equipos, nombre) : this.listarJugadores(equipos);
  }

  /** `/stats <nombre>`: búsqueda directa de estadísticas, sin cambios de comportamiento. */
  private async buscarJugador(equipos: EquipoDelUsuario[], nombre: string): Promise<RespuestaBot> {
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

  /** `/stats` sin argumento: plantilla de cada equipo, para saber a quién pedirle el detalle. */
  private async listarJugadores(equipos: EquipoDelUsuario[]): Promise<RespuestaBot> {
    const bloques = await Promise.all(
      equipos.map(async (equipo) => {
        const plantilla = await this.jugadores.listar(equipo.equipoId);
        const cuerpo = formatearListaJugadores(plantilla, textos.sinJugadores());

        return textos.listadoJugadores(equipo.equipoNombre, cuerpo);
      }),
    );

    return { texto: bloques.join('\n\n') };
  }

  async tabla(usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return respuestaSinEquipos();

    const bloques = await Promise.all(
      equipos.map(async (equipo) => {
        const [stat, goleador] = await Promise.all([
          this.estadisticas.deEquipo(equipo.equipoId),
          this.estadisticas.goleadorDe(equipo.equipoId),
        ]);

        return this.bloqueEquipoConCampeonatos(
          equipo.equipoId,
          equipo.equipoNombre,
          stat,
          goleador,
        );
      }),
    );

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

  /**
   * Agrega el desglose por campeonato al bloque agregado de un equipo, solo
   * cuando aporta algo: si todo el historial cae en un único campeonato (o
   * todo "sin competencia"), el desglose repetiría el bloque agregado que ya
   * se muestra, así que no se pide ni se agrega nada.
   */
  private async bloqueEquipoConCampeonatos(
    equipoId: string,
    equipoNombre: string,
    stat: EstadisticaEquipo | null,
    goleador: Goleador | null,
  ): Promise<string> {
    const bloque = this.bloqueEquipo(equipoNombre, stat, goleador);

    if (!stat) return bloque;

    // `porCompetencia` ya trae el goleador de cada campeonato resuelto en la
    // misma consulta (join lateral): nada que pedir por fila acá.
    const porCompetencia = await this.estadisticas.porCompetencia(equipoId);

    if (porCompetencia.length <= 1) return bloque;

    const lineas = porCompetencia.map((fila) => this.lineaCompetencia(fila));

    return [bloque, [textos.porCampeonato(), ...lineas].join('\n')].join('\n\n');
  }

  private lineaCompetencia(fila: EstadisticaEquipoCompetencia): string {
    return textos.lineaCompetencia({
      nombre: fila.competenciaNombre ?? 'Sin competencia',
      partidosJugados: fila.partidosJugados,
      ganados: fila.ganados,
      empatados: fila.empatados,
      perdidos: fila.perdidos,
      goleador: fila.goleador,
    });
  }
}
