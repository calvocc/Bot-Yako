import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { botonComando, respuestaSinEquipos } from '../conversacion/comandos';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import { MembresiasService } from '../identidad/membresias.service';
import { describirJugador, JugadoresService } from '../jugadores/jugadores.service';
import { AlineacionService } from '../partidos/alineacion.service';
import type { Partido } from '../partidos/partido.mapper';
import { PartidosService } from '../partidos/partidos.service';
import { TiemposService } from '../partidos/tiempos.service';
import { ResumenService } from '../resumen/resumen.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/estadisticas';
import {
  EstadisticasService,
  temporadaActual,
  type EstadisticaEquipoCompetencia,
  type EstadisticaJugador,
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
    private readonly partidos: PartidosService,
    private readonly tiempos: TiemposService,
    private readonly alineacion: AlineacionService,
    private readonly resumen: ResumenService,
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
        plantilla: await this.jugadores.listar(equipo.equipoId, true),
      })),
    );

    const bloques: string[] = [];
    const encontrados: { stat: EstadisticaJugador; esArquero: boolean }[] = [];

    for (const { equipo, stats, plantilla } of porEquipo) {
      for (const stat of stats) {
        const esArquero = plantilla.find((j) => j.id === stat.jugadorId)?.posicion === 'arquero';
        const minutos = await this.minutosDeTemporada(
          equipo.equipoId,
          stat.jugadorId,
          stat.temporada,
        );

        bloques.push(this.lineaJugador(equipo.equipoNombre, stat, { ...minutos, esArquero }));
        encontrados.push({ stat, esArquero });
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
  private totalesPorPersona(
    encontrados: { stat: EstadisticaJugador; esArquero: boolean }[],
  ): string[] {
    const porPersona = new Map<string, { stat: EstadisticaJugador; esArquero: boolean }[]>();

    for (const encontrado of encontrados) {
      if (!encontrado.stat.personaId) continue;
      const grupo = porPersona.get(encontrado.stat.personaId) ?? [];
      grupo.push(encontrado);
      porPersona.set(encontrado.stat.personaId, grupo);
    }

    const bloques: string[] = [];
    const suma = (
      grupo: { stat: EstadisticaJugador; esArquero: boolean }[],
      campo: (s: EstadisticaJugador) => number,
    ): number => grupo.reduce((acc, e) => acc + campo(e.stat), 0);

    for (const grupo of porPersona.values()) {
      if (grupo.length < 2) continue;

      bloques.push(
        textos.totalPersona({
          nombre: grupo[0].stat.nombre,
          temporada: grupo[0].stat.temporada,
          equipos: grupo.length,
          partidosJugados: suma(grupo, (s) => s.partidosJugados),
          goles: suma(grupo, (s) => s.goles),
          asistencias: suma(grupo, (s) => s.asistencias),
          tirosAlArco: suma(grupo, (s) => s.tirosAlArco),
          tirosAfuera: suma(grupo, (s) => s.tirosAfuera),
          regates: suma(grupo, (s) => s.regates),
          faltasRecibidas: suma(grupo, (s) => s.faltasRecibidas),
          pases: suma(grupo, (s) => s.pases),
          recuperaciones: suma(grupo, (s) => s.recuperaciones),
          rechazos: suma(grupo, (s) => s.rechazos),
          atajadas: suma(grupo, (s) => s.atajadas),
          penalesAtajados: suma(grupo, (s) => s.penalesAtajados),
          amarillas: suma(grupo, (s) => s.amarillas),
          rojas: suma(grupo, (s) => s.rojas),
          autogoles: suma(grupo, (s) => s.autogoles),
          faltasCometidas: suma(grupo, (s) => s.faltasCometidas),
          esArquero: grupo.some((e) => e.esArquero),
        }),
      );
    }

    return bloques;
  }

  /**
   * Minutos del jugador en la temporada, sumando partido por partido solo
   * donde corrió un reloj (`datosDeParticipacion` devuelve vacío sin
   * `minutoFinal` o sin titulares, como un post partido). Se acota a los
   * últimos 60 cerrados: una temporada real no los supera y cada partido
   * cuesta dos consultas chicas.
   */
  private async minutosDeTemporada(
    equipoId: string,
    jugadorId: string,
    temporada: number,
  ): Promise<{ minutos: number; partidosConReloj: number }> {
    const cerrados = await this.partidos.cerradosDe(equipoId, 60);
    const deLaTemporada = cerrados.filter((p) => p.fecha.startsWith(String(temporada)));

    const porPartido = await Promise.all(
      deLaTemporada.map(async (partido) => {
        const contexto = await this.tiempos.contextoDeCarga(partido);
        const { minutos } = await this.alineacion.datosDeParticipacion(
          partido.id,
          contexto.minuto.minuto,
        );

        return minutos.size > 0 ? (minutos.get(jugadorId) ?? 0) : null;
      }),
    );

    const conocidos = porPartido.filter((m): m is number => m !== null);

    return {
      minutos: conocidos.reduce((acc, m) => acc + m, 0),
      partidosConReloj: conocidos.length,
    };
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

    if (plantilla.length === 0) {
      return {
        texto: textos.listadoJugadores(equipo.equipoNombre, textos.sinJugadores()),
      };
    }

    return {
      texto: textos.elegirJugador(equipo.equipoNombre),
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

      const minutos = await this.minutosDeTemporada(equipo.equipoId, jugador.id, fila.temporada);

      return {
        texto: this.lineaJugador(equipo.equipoNombre, fila, {
          ...minutos,
          esArquero: jugador.posicion === 'arquero',
        }),
        // `cmd:statspartidos:<jugadorId>` (56 bytes, límite 64): el flujo
        // resuelve el equipo escaneando los del usuario.
        botones: [botonComando('statspartidos', '📅 Partidos', jugador.id)],
      };
    }

    return { texto: textosComunes.noEncontre('a ese jugador entre tus equipos') };
  }

  /**
   * `/tabla [equipo:<id>]`: igual que `/stats` sin nombre —con un solo
   * equipo muestra su ficha directo; con varios, primero ofrece los equipos
   * con botones y enseña solo el elegido. El texto libre no busca por
   * nombre: cae al selector (o a la ficha si hay un solo equipo).
   */
  async tabla(argumento: string | undefined, usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const equipos = await this.membresias.equiposDe(usuarioId);

    if (equipos.length === 0) return respuestaSinEquipos();

    const nombre = argumento?.trim();

    if (nombre?.startsWith(PREFIJO_EQUIPO)) {
      const equipo = equipos.find((e) => e.equipoId === nombre.slice(PREFIJO_EQUIPO.length));

      if (!equipo) {
        return { texto: textosComunes.noEncontre('ese equipo entre los tuyos') };
      }

      return this.fichaDeEquipo(equipo);
    }

    return this.elegirEquipoTabla(equipos);
  }

  /**
   * `/tabla` sin equipo elegido: con un solo equipo va directo a su ficha;
   * con varios, primero los ofrece con botones, sin adelantar ningún dato.
   */
  private async elegirEquipoTabla(equipos: EquipoDelUsuario[]): Promise<RespuestaBot> {
    if (equipos.length === 1) {
      return this.fichaDeEquipo(equipos[0]);
    }

    return {
      texto: textos.eligeEquipoTabla(),
      botones: equipos.map((equipo) =>
        botonComando('tabla', recortar(equipo.equipoNombre), `${PREFIJO_EQUIPO}${equipo.equipoId}`),
      ),
    };
  }

  /**
   * Ficha ampliada del equipo: resultados, goles, un bloque por campeonato
   * (con goleador y MVP) y los agregados de la temporada. El MVP suma los
   * puntos brutos del puntaje partido por partido, con el mismo cálculo del
   * resumen (incluye bonos de cierre).
   */
  private async fichaDeEquipo(equipo: EquipoDelUsuario): Promise<RespuestaBot> {
    const [stat, filas, agregado] = await Promise.all([
      this.estadisticas.deEquipo(equipo.equipoId),
      this.estadisticas.porCompetencia(equipo.equipoId),
      this.estadisticas.agregadoEquipo(equipo.equipoId),
    ]);

    if (!stat) {
      return { texto: textos.sinPartidosCerrados(equipo.equipoNombre, temporadaActual()) };
    }

    const mvps = await this.mvpsPorCompetencia(equipo.equipoId, stat.temporada, filas);

    const bloques = [
      ...textos.fichaEquipo({
        equipoNombre: equipo.equipoNombre,
        temporada: stat.temporada,
        partidosJugados: stat.partidosJugados,
        ganados: stat.ganados,
        empatados: stat.empatados,
        perdidos: stat.perdidos,
        golesFavor: stat.golesFavor,
        golesContra: stat.golesContra,
      }),
    ];

    if (filas.length > 0) {
      bloques.push(textos.tituloCampeonatos(), '');

      for (const fila of filas) {
        bloques.push(
          ...textos.bloqueCampeonato({
            nombre: fila.competenciaNombre ?? 'Sin competencia',
            partidosJugados: fila.partidosJugados,
            ganados: fila.ganados,
            empatados: fila.empatados,
            perdidos: fila.perdidos,
            golesFavor: fila.golesFavor,
            goleador: fila.goleador,
            mvp: mvps.get(fila.competenciaId) ?? null,
          }),
        );
      }
    }

    bloques.push(
      ...textos.aportesEquipo(agregado),
      ...textos.porteriaEquipo(agregado),
      ...textos.disciplinaEquipo(agregado),
    );

    return { texto: bloques.join('\n') };
  }

  /**
   * MVP por campeonato: suma de puntos brutos en los cerrados de la
   * temporada de cada competencia (mismo criterio de la vista, por año de
   * la fecha). Se acota a los últimos 60 cerrados como los minutos de la
   * ficha: una temporada real no los supera. Sin puntaje positivo no hay a
   * quién destacar y ese campeonato sale sin línea MVP.
   */
  private async mvpsPorCompetencia(
    equipoId: string,
    temporada: number,
    filas: EstadisticaEquipoCompetencia[],
  ): Promise<Map<string | null, { nombre: string; puntos: number }>> {
    const competencias = new Set(filas.map((fila) => fila.competenciaId));

    if (competencias.size === 0) return new Map();

    const cerrados = await this.partidos.cerradosDe(equipoId, 60);
    const porCompetencia = new Map<string | null, Partido[]>();

    for (const partido of cerrados) {
      if (!partido.fecha.startsWith(String(temporada))) continue;
      if (!competencias.has(partido.competenciaId)) continue;

      const grupo = porCompetencia.get(partido.competenciaId) ?? [];
      grupo.push(partido);
      porCompetencia.set(partido.competenciaId, grupo);
    }

    const mvps = new Map<string | null, { nombre: string; puntos: number }>();

    for (const [competenciaId, partidos] of porCompetencia) {
      const puntos = new Map<string, { nombre: string; puntos: number; aporte: number }>();

      // Los partidos de un campeonato son independientes: en paralelo.
      const notasPorPartido = await Promise.all(
        partidos.map((partido) => this.resumen.notasDe(partido)),
      );

      for (const notas of notasPorPartido) {
        for (const nota of notas) {
          const acumulado = puntos.get(nota.jugadorId) ?? {
            nombre: nota.nombre,
            puntos: 0,
            aporte: 0,
          };
          acumulado.puntos += nota.puntosBrutos;
          acumulado.aporte += nota.goles + nota.asistencias;
          puntos.set(nota.jugadorId, acumulado);
        }
      }

      const [ganador] = [...puntos.values()]
        .filter((candidato) => candidato.puntos > 0)
        .sort(
          (a, b) =>
            b.puntos - a.puntos || b.aporte - a.aporte || a.nombre.localeCompare(b.nombre, 'es'),
        );

      if (ganador) mvps.set(competenciaId, { nombre: ganador.nombre, puntos: ganador.puntos });
    }

    return mvps;
  }

  private lineaJugador(
    equipoNombre: string,
    stat: EstadisticaJugador,
    extras: { minutos: number; partidosConReloj: number; esArquero: boolean },
  ): string {
    return textos.lineaJugador({
      nombre: stat.nombre,
      dorsal: stat.dorsal,
      equipoNombre,
      temporada: stat.temporada,
      partidosJugados: stat.partidosJugados,
      minutos: extras.minutos,
      partidosConReloj: extras.partidosConReloj,
      goles: stat.goles,
      asistencias: stat.asistencias,
      tirosAlArco: stat.tirosAlArco,
      tirosAfuera: stat.tirosAfuera,
      regates: stat.regates,
      faltasRecibidas: stat.faltasRecibidas,
      pases: stat.pases,
      recuperaciones: stat.recuperaciones,
      rechazos: stat.rechazos,
      atajadas: stat.atajadas,
      penalesAtajados: stat.penalesAtajados,
      amarillas: stat.amarillas,
      rojas: stat.rojas,
      autogoles: stat.autogoles,
      faltasCometidas: stat.faltasCometidas,
      esArquero: extras.esArquero,
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
