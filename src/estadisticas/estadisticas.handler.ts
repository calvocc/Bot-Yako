import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { botonComando, respuestaSinEquipos } from '../conversacion/comandos';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import { MembresiasService } from '../identidad/membresias.service';
import {
  describirJugador,
  formatearListaJugadores,
  JugadoresService,
} from '../jugadores/jugadores.service';
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
 * Selección interna que viaja en el argumento de los botones `cmd:stats:...`
 * (ver `botonComando` en `conversacion/comandos`): `equipo:<equipoId>` lista
 * la plantilla de ese equipo con un botón por jugador, y `jugador:<jugadorId>`
 * muestra las estadísticas de esa ficha. Llevan prefijo para no confundirlas
 * con un nombre escrito a mano —un nombre nunca empieza así— y el id real
 * (no un índice posicional) para que la lista no se corra entre la pregunta
 * y la respuesta. Los dos ids caben en el `callback_data` de Telegram
 * (`cmd:stats:jugador:` + uuid = 54 bytes, límite 64).
 */
const PREFIJO_EQUIPO = 'equipo:';
const PREFIJO_JUGADOR = 'jugador:';

/**
 * `/stats [jugador]` y `/tabla` (RF-6). Cualquier rol puede usarlos —Viewer
 * incluido (RF-6.3)—, así que `/stats <nombre>` y `/tabla` resuelven el
 * equipo igual que `/partidos`: sin `rolMinimo` y un bloque por cada equipo
 * del usuario. En cambio `/stats` sin nombre sí pregunta: con botones, sin
 * estado —primero el equipo (si hay más de uno) y después un botón por
 * jugador— para no obligar a escribir el nombre.
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

    if (!nombre) return this.elegirEquipoOJugadores(equipos);
    if (nombre.startsWith(PREFIJO_EQUIPO)) {
      return this.listarJugadoresDeEquipo(equipos, nombre.slice(PREFIJO_EQUIPO.length));
    }
    if (nombre.startsWith(PREFIJO_JUGADOR)) {
      return this.mostrarJugador(equipos, nombre.slice(PREFIJO_JUGADOR.length));
    }

    return this.buscarJugador(equipos, nombre);
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
          partidosJugados: grupo.reduce((acc, s) => acc + s.partidosJugados, 0),
          goles: grupo.reduce((acc, s) => acc + s.goles, 0),
          asistencias: grupo.reduce((acc, s) => acc + s.asistencias, 0),
          amarillas: grupo.reduce((acc, s) => acc + s.amarillas, 0),
        }),
      );
    }

    return bloques;
  }

  /**
   * `/stats` sin argumento: con un solo equipo va directo a su plantilla
   * (con un botón por jugador); con varios, primero ofrece los equipos con
   * botones, sin adelantar ninguna plantilla.
   */
  private async elegirEquipoOJugadores(equipos: EquipoDelUsuario[]): Promise<RespuestaBot> {
    if (equipos.length === 1) {
      return this.listarJugadoresDeEquipo(equipos, equipos[0].equipoId);
    }

    return {
      texto: textos.eligeEquipo(),
      botones: equipos.map((equipo) =>
        botonComando('stats', recortar(equipo.equipoNombre), `${PREFIJO_EQUIPO}${equipo.equipoId}`),
      ),
    };
  }

  /**
   * Plantilla de un equipo con un botón por jugador. El equipo tiene que ser
   * de los del usuario: un botón viejo (o un `equipo:<id>` escrito a mano)
   * de un equipo al que ya no tiene acceso no muestra nada ajeno.
   */
  private async listarJugadoresDeEquipo(
    equipos: EquipoDelUsuario[],
    equipoId: string,
  ): Promise<RespuestaBot> {
    const equipo = equipos.find((e) => e.equipoId === equipoId);

    if (!equipo) {
      return { texto: textosComunes.noEncontre('ese equipo entre los tuyos') };
    }

    const plantilla = await this.jugadores.listar(equipo.equipoId);
    const cuerpo = formatearListaJugadores(plantilla, textos.sinJugadores());

    if (plantilla.length === 0) {
      return { texto: textos.listadoJugadores(equipo.equipoNombre, cuerpo) };
    }

    return {
      texto: textos.elegirJugador(equipo.equipoNombre, cuerpo),
      botones: plantilla.map((jugador) =>
        botonComando(
          'stats',
          recortar(describirJugador(jugador)),
          `${PREFIJO_JUGADOR}${jugador.id}`,
        ),
      ),
    };
  }

  /**
   * Estadísticas de la ficha elegida con un botón. La ficha se busca solo en
   * los equipos del usuario —un `jugador:<id>` de otro equipo no resuelve— y
   * se muestra solo su bloque, sin el "Total" de `/stats <nombre>`: acá se
   * eligió una ficha puntual, no una persona.
   */
  private async mostrarJugador(
    equipos: EquipoDelUsuario[],
    jugadorId: string,
  ): Promise<RespuestaBot> {
    const porEquipo = await Promise.all(
      equipos.map(async (equipo) => ({
        equipo,
        plantilla: await this.jugadores.listar(equipo.equipoId),
      })),
    );

    for (const { equipo, plantilla } of porEquipo) {
      const jugador = plantilla.find((j) => j.id === jugadorId);

      if (!jugador) continue;

      const stats = await this.estadisticas.deJugador(equipo.equipoId, jugador.nombre);
      const fila = stats.find((s) => s.jugadorId === jugador.id);

      if (!fila) {
        return { texto: textos.sinEstadisticas(jugador.nombre, temporadaActual()) };
      }

      return { texto: this.lineaJugador(equipo.equipoNombre, fila) };
    }

    return { texto: textosComunes.noEncontre('a ese jugador entre tus equipos') };
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
      partidosJugados: stat.partidosJugados,
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

/**
 * El rótulo se recorta a 20 caracteres porque es lo que aceptan los botones
 * de WhatsApp (ver `LIMITE_CARACTERES_TEXTO_BOTON`): el mismo criterio que ya
 * usa el selector de equipo. Con el dorsal primero (`describirJugador`), lo
 * que se pierde al recortar es cola del nombre, no el número.
 */
function recortar(texto: string, maximo = 20): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}
