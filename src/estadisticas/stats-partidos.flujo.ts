import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import { MembresiasService } from '../identidad/membresias.service';
import { JugadoresService, type Jugador } from '../jugadores/jugadores.service';
import { AlineacionService } from '../partidos/alineacion.service';
import type { Partido } from '../partidos/partido.mapper';
import { PartidosService } from '../partidos/partidos.service';
import { TiemposService } from '../partidos/tiempos.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/estadisticas';
import { EstadisticasHandler } from './estadisticas.handler';
import { EventosService } from '../eventos/eventos.service';

export const FLUJO_STATS_PARTIDOS = 'stats-partidos';

const PASOS = { lista: 'lista', detalle: 'detalle' } as const;

const CLAVE_JUGADOR_ID = 'statsJugadorId';
const CLAVE_PARTIDO_ID = 'statsPartidoId';

const PREFIJO_PARTIDO = 'pp:';
const ID_VOLVER_LISTA = 'pp:volver';
const ID_VOLVER_FICHA = 'pp:ficha';

/** Partidos a listar: acota las consultas por partido (ver `conParticipacion`). */
const MAX_PARTIDOS = 8;

interface PartidoJugado {
  partido: Partido;
  minutos: number | null;
}

/**
 * `📅 Partidos` de la ficha (`/stats`): últimos partidos del jugador con su
 * mini-línea, y detalle completo al tocar uno.
 *
 * Entra con `{equipoId, jugadorId}` ya resueltos (botón `cmd:statspartidos:`
 * de la ficha) y arranca directo en la lista, sin re-preguntar nada. Los
 * botones son de flujo (`pp:<partidoId>`, revalidados contra los cerrados
 * del equipo al entrar al detalle): un `cmd:stats:...` sin estado no podría
 * llevar partido + jugador en 64 bytes de `callback_data`.
 */
@Injectable()
export class StatsPartidosFlujo {
  constructor(
    private readonly membresias: MembresiasService,
    private readonly jugadores: JugadoresService,
    private readonly partidos: PartidosService,
    private readonly tiempos: TiemposService,
    private readonly alineacion: AlineacionService,
    private readonly eventos: EventosService,
    private readonly ficha: EstadisticasHandler,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_STATS_PARTIDOS,
      pasoInicial: PASOS.lista,
      pasos: [this.pasoLista(), this.pasoDetalle()],
    };
  }

  private pasoLista(): Paso {
    return {
      id: PASOS.lista,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const resuelto = await this.resolverJugador(ctx);

        if (!resuelto) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: { texto: textosComunes.noEncontre('a ese jugador entre tus equipos') },
            },
          };
        }

        const { equipo, jugador } = resuelto;
        const cerrados = await this.partidos.cerradosDe(equipo.equipoId, 30);
        const jugados = await this.conParticipacion(jugador.id, cerrados);

        if (jugados.length === 0) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: { texto: textos.sinPartidosJugador(jugador.nombre, equipo.equipoNombre) },
            },
          };
        }

        return {
          respuesta: {
            texto: textos.listaPartidosJugador(
              jugador.nombre,
              jugador.dorsal,
              equipo.equipoNombre,
              jugados.map((j) => this.lineaPartido(j)),
            ),
            botones: jugados.map((j) => ({
              id: `${PREFIJO_PARTIDO}${j.partido.id}`,
              texto: recortar(`${fechaCorta(j.partido.fecha)} ${j.partido.rival}`),
            })),
          },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (!seleccion.startsWith(PREFIJO_PARTIDO)) {
          return { tipo: 'repetir', respuesta: await this.repetirLista(ctx) };
        }

        return {
          tipo: 'ir',
          pasoId: PASOS.detalle,
          datos: { [CLAVE_PARTIDO_ID]: seleccion.slice(PREFIJO_PARTIDO.length) },
        };
      },
    };
  }

  private pasoDetalle(): Paso {
    return {
      id: PASOS.detalle,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const resuelto = await this.resolverJugador(ctx);

        if (!resuelto) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: { texto: textosComunes.noEncontre('a ese jugador entre tus equipos') },
            },
          };
        }

        // El partido se revalida contra los cerrados del equipo en cada
        // entrada: un botón viejo de otro equipo no resuelve.
        const partidoId = leerTexto(ctx.datos, CLAVE_PARTIDO_ID);
        const partido = (await this.partidos.cerradosDe(resuelto.equipo.equipoId, 60)).find(
          (p) => p.id === partidoId,
        );

        if (!partido) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: { texto: textosComunes.noEncontre('ese partido entre los cerrados') },
            },
          };
        }

        const [cargados, contexto] = await Promise.all([
          this.eventos.delPartido(partido.id),
          this.tiempos.contextoDeCarga(partido),
        ]);
        const { minutos } = await this.alineacion.datosDeParticipacion(
          partido.id,
          contexto.minuto.minuto,
        );
        const propios = cargados.filter((e) => e.jugadorId === resuelto.jugador.id);
        const cuenta = (tipo: string): number => propios.filter((e) => e.tipo === tipo).length;

        return {
          respuesta: {
            texto: textos.detallePartidoJugador({
              nombre: resuelto.jugador.nombre,
              dorsal: resuelto.jugador.dorsal,
              fecha: partido.fecha,
              rival: partido.rival,
              minutos: minutos.size > 0 ? (minutos.get(resuelto.jugador.id) ?? 0) : null,
              goles: cuenta('gol') + cuenta('gol_penal') + cuenta('gol_tiro_libre'),
              asistencias: cuenta('asistencia'),
              tirosAlArco: cuenta('tiro_al_arco'),
              tirosAfuera: cuenta('tiro_afuera'),
              regates: cuenta('regate'),
              faltasRecibidas: cuenta('falta_recibida'),
              pases: cuenta('pase'),
              recuperaciones: cuenta('recuperacion'),
              rechazos: cuenta('rechazo'),
              atajadas: cuenta('atajada'),
              penalesAtajados: cuenta('penal_atajado'),
              amarillas: cuenta('tarjeta_amarilla'),
              rojas: cuenta('tarjeta_roja'),
              autogoles: cuenta('autogol'),
              faltasCometidas: cuenta('falta_cometida'),
              esArquero: resuelto.jugador.posicion === 'arquero',
            }),
            botones: [
              { id: ID_VOLVER_LISTA, texto: '◀ Partidos' },
              { id: ID_VOLVER_FICHA, texto: '◀ Ficha' },
            ],
          },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (seleccion === ID_VOLVER_LISTA) {
          return { tipo: 'ir', pasoId: PASOS.lista };
        }

        if (seleccion === ID_VOLVER_FICHA) {
          const respuesta = await this.ficha.stats(
            `jugador:${leerTexto(ctx.datos, CLAVE_JUGADOR_ID)}`,
            ctx.usuarioId,
          );

          return { tipo: 'finalizar', respuesta };
        }

        return { tipo: 'repetir', respuesta: await this.repetirDetalle(ctx) };
      },
    };
  }

  /**
   * La ficha elegida, buscada solo en los equipos del usuario en cada paso:
   * un botón viejo (o un id escrito a mano) de un equipo al que ya no tiene
   * acceso no muestra nada ajeno. El equipo se resuelve escaneando porque el
   * botón (`cmd:statspartidos:<jugadorId>`) solo lleva la ficha: equipo +
   * jugador no caben en 64 bytes de `callback_data`.
   */
  private async resolverJugador(
    ctx: ContextoFlujo,
  ): Promise<{ equipo: EquipoDelUsuario; jugador: Jugador } | null> {
    if (!ctx.usuarioId) return null;

    const jugadorId = leerTexto(ctx.datos, CLAVE_JUGADOR_ID);

    if (!jugadorId) return null;

    const equipos = await this.membresias.equiposDe(ctx.usuarioId);
    const porEquipo = await Promise.all(
      equipos.map(async (equipo) => ({
        equipo,
        jugador: (await this.jugadores.listar(equipo.equipoId, true)).find(
          (j) => j.id === jugadorId,
        ),
      })),
    );

    const hallado = porEquipo.find((e) => e.jugador);

    return hallado && hallado.jugador ? { equipo: hallado.equipo, jugador: hallado.jugador } : null;
  }

  /**
   * Últimos cerrados donde el jugador participó (evento propio, cambio o
   * titular), con minutos si corrió reloj. Se filtra por participación
   * antes de cortar en MAX_PARTIDOS: los N más recientes pueden no
   * incluirlo.
   */
  private async conParticipacion(jugadorId: string, cerrados: Partido[]): Promise<PartidoJugado[]> {
    const porPartido = await Promise.all(
      cerrados.map(async (partido) => {
        const contexto = await this.tiempos.contextoDeCarga(partido);
        const participacion = await this.alineacion.datosDeParticipacion(
          partido.id,
          contexto.minuto.minuto,
        );

        return { partido, participacion };
      }),
    );

    return porPartido
      .filter(({ participacion }) => participacion.participantes.includes(jugadorId))
      .slice(0, MAX_PARTIDOS)
      .map(({ partido, participacion }) => ({
        partido,
        minutos:
          participacion.minutos.size > 0 ? (participacion.minutos.get(jugadorId) ?? 0) : null,
      }));
  }

  private lineaPartido(jugado: PartidoJugado): string {
    return textos.lineaPartidoJugado({
      fecha: jugado.partido.fecha,
      rival: jugado.partido.rival,
      minutos: jugado.minutos,
    });
  }

  private async repetirLista(ctx: ContextoFlujo): Promise<RespuestaBot> {
    const entrada = await this.pasoLista().entrar(ctx);

    if ('respuesta' in entrada) return entrada.respuesta;

    return { texto: textosComunes.noEncontre('a ese jugador entre tus equipos') };
  }

  private async repetirDetalle(ctx: ContextoFlujo): Promise<RespuestaBot> {
    const entrada = await this.pasoDetalle().entrar(ctx);

    if ('respuesta' in entrada) return entrada.respuesta;

    return { texto: textosComunes.noEncontre('ese partido entre los cerrados') };
  }
}

/** `2026-09-14` → `14/09`: corto para el rótulo del botón (límite 20). */
function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-');

  return dia && mes ? `${dia}/${mes}` : fecha;
}

function recortar(texto: string, maximo = 20): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}
