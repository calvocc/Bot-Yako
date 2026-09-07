import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { botonComando, respuestaSinEquipos } from '../conversacion/comandos';
import {
  CLAVE_PARTIDO_ID_CARGA,
  CLAVE_DESTINO,
  FLUJO_CARGAR,
  PASO_FIN_PARTIDO_CARGA,
  PASO_MODO_CARGA,
  type DestinoCarga,
} from '../eventos/cargar.flujo';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
} from '../conversacion/pasos-comunes/selector-equipo';
import type { DelegarAFlujo } from '../conversacion/router.service';
import { EquiposService } from '../equipos/equipos.service';
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
    private readonly equipos: EquiposService,
  ) {}

  /**
   * Atajo de "Editar partido"/"Finalizar" tras /reabrir (y de cualquier otro
   * lugar que ya sepa qué partido quiere seguir cargando): equipo y partido
   * ya se eligieron ahí mismo, así que entra directo al paso que corresponde
   * de /cargar en vez de volver a preguntarlos -- ver `PASO_MODO_CARGA` /
   * `PASO_FIN_PARTIDO_CARGA` en `cargar.flujo.ts`.
   *
   * Revalida el rol acá (no alcanza con el que ya se comprobó en /reabrir):
   * pudo pasar tiempo entre que se reabrió el partido y se tocó el botón.
   */
  async continuarCarga(
    partidoId: string | undefined,
    usuarioId: string | undefined,
    destino: DestinoCarga,
  ): Promise<RespuestaBot | DelegarAFlujo> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };
    if (!partidoId) return { texto: textosComunes.noEncontre('ese partido') };

    const partido = await this.partidos.obtener(partidoId);

    if (!partido) return { texto: textosComunes.noEncontre('ese partido') };

    const puede = await this.membresias.puede(usuarioId, partido.equipoId, 'editor');

    if (!puede) return { texto: textosComunes.sinPermisoPara('cargar este partido') };

    const equipo = await this.equipos.obtener(partido.equipoId);

    return {
      tipo: 'delegar',
      flujoId: FLUJO_CARGAR,
      pasoInicial: destino === 'finalizar' ? PASO_FIN_PARTIDO_CARGA : PASO_MODO_CARGA,
      datos: {
        [CLAVE_EQUIPO_ID]: partido.equipoId,
        [CLAVE_EQUIPO_NOMBRE]: equipo?.nombre ?? 'Tu equipo',
        [CLAVE_PARTIDO_ID_CARGA]: partido.id,
        [CLAVE_DESTINO]: destino,
      },
    };
  }

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
