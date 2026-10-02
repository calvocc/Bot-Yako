import { LIMITE_BYTES_ID_BOTON } from '../channels/channel.types';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import type { MembresiasService } from '../identidad/membresias.service';
import type { Jugador } from '../jugadores/jugadores.service';
import type { JugadoresService } from '../jugadores/jugadores.service';
import type { AlineacionService } from '../partidos/alineacion.service';
import type { PartidosService } from '../partidos/partidos.service';
import type { Partido } from '../partidos/partido.mapper';
import type { TiemposService } from '../partidos/tiempos.service';
import { EstadisticasHandler } from './estadisticas.handler';
import { temporadaActual } from './estadisticas.service';
import type { EstadisticaJugador } from './estadisticas.service';
import type { EstadisticasService } from './estadisticas.service';

const EQUIPO_1 = '11111111-1111-1111-1111-111111111111';
const EQUIPO_2 = '22222222-2222-2222-2222-222222222222';
const JACOB_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANDRES_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function equipo(equipoId: string, equipoNombre: string): EquipoDelUsuario {
  return {
    equipoId,
    equipoNombre,
    academiaId: 'academia-1',
    academiaNombre: 'Ringo Amaya',
    rol: 'viewer',
  };
}

function jugador(
  id: string,
  nombre: string,
  dorsal: number | null,
  posicion: Jugador['posicion'] = null,
): Jugador {
  return {
    id,
    nombre,
    dorsal,
    activo: true,
    posicion,
    fechaNacimiento: null,
    pesoKg: null,
    estaturaCm: null,
  };
}

function fila(jugadorId: string, equipoId: string, nombre: string): EstadisticaJugador {
  return {
    jugadorId,
    equipoId,
    personaId: null,
    nombre,
    dorsal: 10,
    temporada: temporadaActual(),
    partidosJugados: 8,
    goles: 6,
    autogoles: 0,
    asistencias: 2,
    amarillas: 1,
    rojas: 0,
    recuperaciones: 0,
    rechazos: 0,
    regates: 0,
    tirosAlArco: 0,
    faltasRecibidas: 0,
    atajadas: 0,
    penalesAtajados: 0,
  };
}

interface Mundo {
  equipos: EquipoDelUsuario[];
  plantillas: Record<string, Jugador[]>;
  stats: Record<string, EstadisticaJugador[]>;
  /** Partidos cerrados por equipo, para el cálculo de minutos. */
  cerrados?: Record<string, Partido[]>;
  /** Minutos por partido (`partidoId -> jugadorId -> minutos`). */
  minutos?: Record<string, Record<string, number>>;
}

function partido(id: string, fecha: string): Partido {
  return {
    id,
    equipoId: EQUIPO_1,
    rival: 'Rival',
    fecha,
    competenciaId: null,
    competenciaNombre: null,
    cantidadTiempos: 2,
    minutosPorTiempo: 25,
    tiempoActual: 2,
    tiempoEstado: 'finalizado',
    tiempoIniciadoEn: null,
    estado: 'cerrado',
    marcadorPropio: 1,
    marcadorRival: 0,
    creadoPor: 'admin',
    creadoEn: new Date(),
  } as unknown as Partido;
}

function handlerDe(mundo: Mundo): EstadisticasHandler {
  const membresias = {
    equiposDe: () => Promise.resolve(mundo.equipos),
  } as unknown as MembresiasService;

  const jugadores = {
    listar: (equipoId: string) => Promise.resolve(mundo.plantillas[equipoId] ?? []),
  } as unknown as JugadoresService;

  const estadisticas = {
    deJugador: (equipoId: string) => Promise.resolve(mundo.stats[equipoId] ?? []),
  } as unknown as EstadisticasService;

  const partidos = {
    cerradosDe: (equipoId: string) => Promise.resolve(mundo.cerrados?.[equipoId] ?? []),
  } as unknown as PartidosService;

  const tiempos = {
    contextoDeCarga: () => Promise.resolve({ minuto: { minuto: 50 } }),
  } as unknown as TiemposService;

  const alineacion = {
    datosDeParticipacion: (partidoId: string) => {
      const minutos = new Map(Object.entries(mundo.minutos?.[partidoId] ?? {}));

      return Promise.resolve({ participantes: [...minutos.keys()], minutos });
    },
  } as unknown as AlineacionService;

  return new EstadisticasHandler(
    membresias,
    jugadores,
    estadisticas,
    partidos,
    tiempos,
    alineacion,
  );
}

const bytesDe = (texto: string): number => Buffer.byteLength(texto, 'utf8');

describe('EstadisticasHandler.stats por botones', () => {
  it('/stats con nombre sigue buscando directo, sin botones', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11'), equipo(EQUIPO_2, 'Sub-13')],
      plantillas: {},
      stats: { [EQUIPO_1]: [fila(JACOB_1, EQUIPO_1, 'Jacob')] },
    });

    const respuesta = await handler.stats('Jacob', 'user-1');

    expect(respuesta.texto).toContain('📊 Jacob #10 — Sub-11');
    expect(respuesta.botones).toBeUndefined();
  });

  it('/stats con un solo equipo muestra su plantilla con un botón por jugador', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: {
        [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10), jugador(ANDRES_1, 'Andrés', 7)],
      },
      stats: {},
    });

    const respuesta = await handler.stats(undefined, 'user-1');

    expect(respuesta.texto).toContain('📋 Sub-11:');
    expect(respuesta.texto).toContain('Toca un jugador');
    expect(respuesta.botones?.map((b) => b.id)).toEqual([
      `cmd:stats:jugador:${JACOB_1}`,
      `cmd:stats:jugador:${ANDRES_1}`,
    ]);
    for (const boton of respuesta.botones ?? []) {
      expect(bytesDe(boton.id)).toBeLessThanOrEqual(LIMITE_BYTES_ID_BOTON);
    }
  });

  it('/stats con varios equipos ofrece los equipos sin adelantar plantillas', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11'), equipo(EQUIPO_2, 'Sub-13')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: {},
    });

    const respuesta = await handler.stats(undefined, 'user-1');

    expect(respuesta.texto).toContain('¿De qué equipo quieres ver estadísticas?');
    expect(respuesta.texto).not.toContain('Jacob');
    expect(respuesta.botones?.map((b) => b.id)).toEqual([
      `cmd:stats:equipo:${EQUIPO_1}`,
      `cmd:stats:equipo:${EQUIPO_2}`,
    ]);
  });

  it('elegir equipo lista sus jugadores con botones', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11'), equipo(EQUIPO_2, 'Sub-13')],
      plantillas: { [EQUIPO_2]: [jugador(ANDRES_1, 'Andrés', 7)] },
      stats: {},
    });

    const respuesta = await handler.stats(`equipo:${EQUIPO_2}`, 'user-1');

    expect(respuesta.texto).toContain('📋 Sub-13:');
    expect(respuesta.botones?.map((b) => b.id)).toEqual([`cmd:stats:jugador:${ANDRES_1}`]);
  });

  it('elegir un equipo ajeno no muestra nada', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: {},
    });

    const respuesta = await handler.stats(`equipo:${EQUIPO_2}`, 'user-1');

    expect(respuesta.texto).toContain('No encontré ese equipo entre los tuyos');
    expect(respuesta.botones).toBeUndefined();
  });

  it('elegir jugador muestra sus estadísticas', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: { [EQUIPO_1]: [fila(JACOB_1, EQUIPO_1, 'Jacob')] },
    });

    const respuesta = await handler.stats(`jugador:${JACOB_1}`, 'user-1');

    expect(respuesta.texto).toContain('📊 Jacob #10 — Sub-11');
    expect(respuesta.texto).toContain('Goles: 6');
  });

  it('elegir jugador sin estadísticas cargadas lo dice', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: {},
    });

    const respuesta = await handler.stats(`jugador:${JACOB_1}`, 'user-1');

    expect(respuesta.texto).toContain('Todavía no tiene estadísticas cargadas');
  });

  it('elegir un jugador ajeno no muestra nada', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: {},
    });

    const respuesta = await handler.stats(`jugador:${ANDRES_1}`, 'user-1');

    expect(respuesta.texto).toContain('No encontré a ese jugador entre tus equipos');
  });

  it('la ficha trae grupos, eficiencia y minutos cuando hay reloj', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: { [EQUIPO_1]: [fila(JACOB_1, EQUIPO_1, 'Jacob')] },
      cerrados: { [EQUIPO_1]: [partido('p1', `${temporadaActual()}-03-01`)] },
      minutos: { p1: { [JACOB_1]: 58 } },
    });

    const respuesta = await handler.stats(`jugador:${JACOB_1}`, 'user-1');

    expect(respuesta.texto).toContain('🏟️ PARTICIPACIÓN');
    expect(respuesta.texto).toContain('8 partidos · 58 min');
    expect(respuesta.texto).toContain('⚽ ATAQUE');
    expect(respuesta.texto).toContain('0.75 G/PJ');
    expect(respuesta.texto).toContain("contribuciones/90'");
    // Sin nada en defensa ni portería esos grupos no aparecen (la fila trae
    // 1 amarilla, así que disciplina sí sale).
    expect(respuesta.texto).not.toContain('🛡️ DEFENSA');
    expect(respuesta.texto).not.toContain('🧤 PORTERÍA');
    expect(respuesta.texto).toContain('🟨 DISCIPLINA');
  });

  it('sin reloj avisa que no hay minutos y no inventa per-90', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: { [EQUIPO_1]: [fila(JACOB_1, EQUIPO_1, 'Jacob')] },
    });

    const respuesta = await handler.stats(`jugador:${JACOB_1}`, 'user-1');

    expect(respuesta.texto).toContain('sin registro de minutos');
    expect(respuesta.texto).not.toContain("90'");
    expect(respuesta.texto).toContain('0.75 G/PJ');
  });

  it('el grupo portería sale solo con atajadas o posición de arquero', async () => {
    const arquero = { ...fila(JACOB_1, EQUIPO_1, 'Jacob'), atajadas: 7, penalesAtajados: 1 };
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 1, 'arquero')] },
      stats: { [EQUIPO_1]: [arquero] },
    });

    const respuesta = await handler.stats(`jugador:${JACOB_1}`, 'user-1');

    expect(respuesta.texto).toContain('🧤 PORTERÍA');
    expect(respuesta.texto).toContain('Atajadas: 7');
  });
});
