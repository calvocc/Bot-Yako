import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { respuestaSinEquipos } from '../conversacion/comandos';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import { MembresiasService } from '../identidad/membresias.service';
import { JugadoresService } from '../jugadores/jugadores.service';
import { parsearFecha } from '../partidos/fechas';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/entrenamientos';
import { EntrenamientosService } from './entrenamientos.service';

/**
 * `/asistencias [nombre | fecha]`. Cualquier rol puede consultar -- Viewer
 * incluido, igual que `/stats` -- así que resuelve el equipo con un bloque
 * por cada uno del usuario, sin preguntar cuál (es una consulta, no una
 * acción).
 */
@Injectable()
export class AsistenciaHandler {
  constructor(
    private readonly membresias: MembresiasService,
    private readonly jugadores: JugadoresService,
    private readonly entrenamientos: EntrenamientosService,
  ) {}

  async asistencias(argumento: string | undefined, usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return respuestaSinEquipos();

    const texto = argumento?.trim();

    if (!texto) return this.resumenPorEquipo(equipos);

    // "asistencias 12-10" es una fecha, "asistencias Jacob" es un nombre: se
    // prueba como fecha primero porque un nombre de jugador nunca matchea
    // ese formato.
    const fecha = parsearFecha(texto);

    return fecha ? this.porFecha(equipos, fecha) : this.buscarJugador(equipos, texto);
  }

  /** `/asistencias` sin argumento: cuántos entrenamientos y qué % de asistencia promedio lleva cada equipo. */
  private async resumenPorEquipo(equipos: EquipoDelUsuario[]): Promise<RespuestaBot> {
    const bloques = await Promise.all(
      equipos.map(async (equipo) => {
        const resumen = await this.entrenamientos.resumenDeEquipo(equipo.equipoId);

        return textos.asistencias.resumenEquipo(
          equipo.equipoNombre,
          resumen.totalEntrenamientos,
          resumen.promedioAsistencia,
        );
      }),
    );

    return { texto: bloques.join('\n\n') };
  }

  /** `/asistencias <nombre>`: historial de presente/ausente de ese jugador, en cada equipo donde aparece. */
  private async buscarJugador(equipos: EquipoDelUsuario[], nombre: string): Promise<RespuestaBot> {
    const buscado = nombre.trim().toLowerCase();

    const porEquipo = await Promise.all(
      equipos.map(async (equipo) => {
        const plantilla = await this.jugadores.listar(equipo.equipoId, true);
        const encontrados = plantilla.filter((j) => j.nombre.toLowerCase().includes(buscado));

        const detalles = await Promise.all(
          encontrados.map(async (jugador) => ({
            jugador,
            fechas: await this.entrenamientos.asistenciaDeJugador(equipo.equipoId, jugador.id),
          })),
        );

        return { equipo, detalles };
      }),
    );

    const bloques = porEquipo.flatMap(({ equipo, detalles }) =>
      detalles.map(({ jugador, fechas }) =>
        textos.asistencias.lineaJugador(equipo.equipoNombre, jugador, fechas),
      ),
    );

    if (bloques.length === 0) return { texto: textos.asistencias.sinNadie(nombre) };

    return { texto: bloques.join('\n\n') };
  }

  /** `/asistencias <fecha>`: planilla completa (toda la plantilla, presente/ausente) de ese día, por equipo. */
  private async porFecha(equipos: EquipoDelUsuario[], fecha: string): Promise<RespuestaBot> {
    const porEquipo = await Promise.all(
      equipos.map(async (equipo) => ({
        equipo,
        detalle: await this.entrenamientos.detalleDeSesion(equipo.equipoId, fecha),
      })),
    );

    const bloques = porEquipo
      .filter((f): f is typeof f & { detalle: NonNullable<typeof f.detalle> } => f.detalle !== null)
      .map(({ equipo, detalle }) =>
        textos.asistencias.planillaDelDia(equipo.equipoNombre, fecha, detalle.jugadores),
      );

    if (bloques.length === 0) return { texto: textos.asistencias.sinEntrenamientoEseDia(fecha) };

    return { texto: bloques.join('\n\n') };
  }
}
