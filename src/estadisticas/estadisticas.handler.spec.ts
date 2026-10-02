import { LIMITE_BYTES_ID_BOTON } from '../channels/channel.types';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import type { MembresiasService } from '../identidad/membresias.service';
import type { Jugador } from '../jugadores/jugadores.service';
import type { JugadoresService } from '../jugadores/jugadores.service';
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

function jugador(id: string, nombre: string, dorsal: number | null): Jugador {
  return {
    id,
    nombre,
    dorsal,
    activo: true,
    posicion: null,
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

  return new EstadisticasHandler(membresias, jugadores, estadisticas);
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
});
