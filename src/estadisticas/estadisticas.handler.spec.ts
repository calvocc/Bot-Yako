import { LIMITE_BYTES_ID_BOTON } from '../channels/channel.types';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import type { MembresiasService } from '../identidad/membresias.service';
import type { Jugador } from '../jugadores/jugadores.service';
import type { JugadoresService } from '../jugadores/jugadores.service';
import type { NotaJugador } from '../eventos/puntaje';
import type { AlineacionService } from '../partidos/alineacion.service';
import type { PartidosService } from '../partidos/partidos.service';
import type { Partido } from '../partidos/partido.mapper';
import type { TiemposService } from '../partidos/tiempos.service';
import type { ResumenService } from '../resumen/resumen.service';
import { EstadisticasHandler } from './estadisticas.handler';
import { temporadaActual } from './estadisticas.service';
import type { AgregadoEquipo } from './estadisticas.service';
import type { EstadisticaEquipo } from './estadisticas.service';
import type { EstadisticaEquipoCompetencia } from './estadisticas.service';
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
    tirosAfuera: 0,
    pases: 0,
    faltasCometidas: 0,
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
  /** Fila de `estadisticas_equipo` para `/tabla` (`null` = sin cerrados). */
  tabla?: EstadisticaEquipo | null;
  campeonatos?: EstadisticaEquipoCompetencia[];
  agregado?: AgregadoEquipo;
  /** Notas por partido (`partidoId -> notas`), para el MVP de `/tabla`. */
  notas?: Record<string, NotaJugador[]>;
}

function nota(
  jugadorId: string,
  nombre: string,
  puntosBrutos: number,
  goles = 0,
  asistencias = 0,
): NotaJugador {
  return {
    jugadorId,
    nombre,
    dorsal: 10,
    posicion: null,
    puntosBrutos,
    nota: 6,
    goles,
    asistencias,
    amarillas: 0,
    rojas: 0,
    autogoles: 0,
    recuperaciones: 0,
    rechazos: 0,
    regates: 0,
    tirosAlArco: 0,
    tirosAfuera: 0,
    pases: 0,
    faltasRecibidas: 0,
    faltasCometidas: 0,
    atajadas: 0,
    penalesAtajados: 0,
  };
}

function partido(id: string, fecha: string, competenciaId: string | null = null): Partido {
  return {
    id,
    equipoId: EQUIPO_1,
    rival: 'Rival',
    fecha,
    competenciaId,
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
    deEquipo: () => Promise.resolve(mundo.tabla ?? null),
    porCompetencia: () => Promise.resolve(mundo.campeonatos ?? []),
    agregadoEquipo: () =>
      Promise.resolve(
        mundo.agregado ?? {
          goles: 0,
          asistencias: 0,
          tirosAlArco: 0,
          tirosAfuera: 0,
          regates: 0,
          recuperaciones: 0,
          rechazos: 0,
          atajadas: 0,
          penalesAtajados: 0,
          amarillas: 0,
          rojas: 0,
          autogoles: 0,
        },
      ),
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

  const resumen = {
    notasDe: (partido: Partido) => Promise.resolve(mundo.notas?.[partido.id] ?? []),
  } as unknown as ResumenService;

  return new EstadisticasHandler(
    membresias,
    jugadores,
    estadisticas,
    partidos,
    tiempos,
    alineacion,
    resumen,
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
    // Sin lista duplicada en el texto: los nombres viven solo en los botones.
    expect(respuesta.texto).not.toContain('Jacob');
    expect(respuesta.texto).not.toContain('Andrés');
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
    expect(respuesta.texto).toContain('⚽ 6 goles · 🅰️ 2 asistencias');
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

  it('la ficha trae grupos, minutos y ritmo cuando hay reloj', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: { [EQUIPO_1]: [fila(JACOB_1, EQUIPO_1, 'Jacob')] },
      cerrados: { [EQUIPO_1]: [partido('p1', `${temporadaActual()}-03-01`)] },
      minutos: { p1: { [JACOB_1]: 58 } },
    });

    const respuesta = await handler.stats(`jugador:${JACOB_1}`, 'user-1');

    expect(respuesta.texto).toContain('🏟️ PARTICIPACIÓN');
    expect(respuesta.texto).toContain('8 partidos');
    expect(respuesta.texto).toContain('⏱️ 58 min registrados en 1 partido');
    expect(respuesta.texto).toContain('⚽ ATAQUE');
    expect(respuesta.texto).toContain('⚽ 6 goles · 🅰️ 2 asistencias');
    expect(respuesta.texto).toContain('🔥 8 aportes de gol en total');
    expect(respuesta.texto).toContain('📈 Un aporte de gol por partido');
    // Sin nada en defensa ni portería esos grupos no aparecen; disciplina
    // sale siempre, aunque la fila solo traiga 1 amarilla.
    expect(respuesta.texto).not.toContain('🛡️ DEFENSA');
    expect(respuesta.texto).not.toContain('🧤 PORTERÍA');
    expect(respuesta.texto).toContain('🟨 1 amarilla · 🟥 0 rojas · 🙃 0 autogoles');
  });

  it('sin reloj avisa que no hay minutos, sin tecnicismos', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: { [EQUIPO_1]: [jugador(JACOB_1, 'Jacob', 10)] },
      stats: { [EQUIPO_1]: [fila(JACOB_1, EQUIPO_1, 'Jacob')] },
    });

    const respuesta = await handler.stats(`jugador:${JACOB_1}`, 'user-1');

    expect(respuesta.texto).toContain('⏱️ sin registro de minutos');
    expect(respuesta.texto).not.toContain("90'");
    expect(respuesta.texto).not.toContain('G/PJ');
    expect(respuesta.texto).toContain('⚽ 6 goles · 🅰️ 2 asistencias');
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
    expect(respuesta.texto).toContain('🧤 7 atajadas · 🥅 1 penal atajado');
  });
});

function tablaEquipo(): EstadisticaEquipo {
  return {
    equipoId: EQUIPO_1,
    temporada: temporadaActual(),
    partidosJugados: 9,
    ganados: 2,
    empatados: 3,
    perdidos: 4,
    golesFavor: 15,
    golesContra: 18,
  };
}

describe('EstadisticasHandler.tabla por botones', () => {
  it('/tabla con varios equipos ofrece los equipos sin adelantar datos', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11'), equipo(EQUIPO_2, 'Sub-13')],
      plantillas: {},
      stats: {},
    });

    const respuesta = await handler.tabla(undefined, 'user-1');

    expect(respuesta.texto).toContain('¿De qué equipo quieres ver la tabla?');
    expect(respuesta.texto).not.toContain('RESULTADOS');
    expect(respuesta.botones?.map((b) => b.id)).toEqual([
      `cmd:tabla:equipo:${EQUIPO_1}`,
      `cmd:tabla:equipo:${EQUIPO_2}`,
    ]);
    for (const boton of respuesta.botones ?? []) {
      expect(bytesDe(boton.id)).toBeLessThanOrEqual(LIMITE_BYTES_ID_BOTON);
    }
  });

  it('/tabla con un solo equipo muestra su ficha directo', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: {},
      stats: {},
      tabla: tablaEquipo(),
    });

    const respuesta = await handler.tabla(undefined, 'user-1');

    // El botón lleva al listado seleccionable de jugadores de ese equipo.
    expect(respuesta.botones?.map((b) => b.id)).toEqual([`cmd:stats:equipo:${EQUIPO_1}`]);
    expect(respuesta.botones?.map((b) => b.texto)).toEqual(['👥 Ver jugadores']);
    expect(respuesta.texto).toContain('📋 Sub-11 — Temporada');
    expect(respuesta.texto).toContain('🏟️ RESULTADOS');
    expect(respuesta.texto).toContain('9 partidos · 🟢 2 ganados');
    expect(respuesta.texto).toContain('📊 Diferencia: -3');
    expect(respuesta.texto).toContain('👥 APORTES DEL EQUIPO');
    expect(respuesta.texto).toContain('🟨 DISCIPLINA');
    // Sin campeonatos no hay sección; sin atajadas no hay portería.
    expect(respuesta.texto).not.toContain('POR CAMPEONATO');
    expect(respuesta.texto).not.toContain('🧤 PORTERÍA');
  });

  it('elegir equipo muestra su ficha y uno ajeno no muestra nada', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11'), equipo(EQUIPO_2, 'Sub-13')],
      plantillas: {},
      stats: {},
      tabla: tablaEquipo(),
    });

    const respuesta = await handler.tabla(`equipo:${EQUIPO_1}`, 'user-1');

    expect(respuesta.texto).toContain('📋 Sub-11 — Temporada');

    const ajeno = await handler.tabla('equipo:equipo-ajeno', 'user-1');

    expect(ajeno.texto).toContain('No encontré ese equipo entre los tuyos');
    expect(ajeno.botones).toBeUndefined();
  });

  it('/tabla sin cerrados lo dice', async () => {
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: {},
      stats: {},
      tabla: null,
    });

    const respuesta = await handler.tabla(undefined, 'user-1');

    expect(respuesta.texto).toContain('Sin partidos cerrados todavía.');
  });

  it('el campeonato trae goleador y MVP sumando puntos de sus partidos', async () => {
    const liga = 'aaaaaaaa-0000-0000-0000-000000000001';
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: {},
      stats: {},
      tabla: tablaEquipo(),
      campeonatos: [
        {
          equipoId: EQUIPO_1,
          temporada: temporadaActual(),
          competenciaId: liga,
          competenciaNombre: 'Liga',
          partidosJugados: 2,
          ganados: 1,
          empatados: 1,
          perdidos: 0,
          golesFavor: 3,
          golesContra: 1,
          goleador: { nombre: 'Jacob', dorsal: 10, goles: 2 },
        },
      ],
      cerrados: {
        [EQUIPO_1]: [
          partido('p1', `${temporadaActual()}-03-01`, liga),
          partido('p2', `${temporadaActual()}-03-08`, liga),
        ],
      },
      notas: {
        p1: [nota(JACOB_1, 'Jacob', 5, 2, 0)],
        p2: [nota(JACOB_1, 'Jacob', 3, 0, 1), nota(ANDRES_1, 'Andrés', 4, 1, 0)],
      },
    });

    const respuesta = await handler.tabla(undefined, 'user-1');

    expect(respuesta.texto).toContain('🏆 POR CAMPEONATO');
    expect(respuesta.texto).toContain('🏆 Liga');
    expect(respuesta.texto).toContain('🥇 Goleador: Jacob (2 goles)');
    // Jacob suma 5 + 3 = 8 puntos contra 4 de Andrés.
    expect(respuesta.texto).toContain('⭐ MVP: Jacob (8 pts)');
  });

  it('sin puntaje positivo el campeonato sale sin línea MVP', async () => {
    const liga = 'aaaaaaaa-0000-0000-0000-000000000001';
    const handler = handlerDe({
      equipos: [equipo(EQUIPO_1, 'Sub-11')],
      plantillas: {},
      stats: {},
      tabla: tablaEquipo(),
      campeonatos: [
        {
          equipoId: EQUIPO_1,
          temporada: temporadaActual(),
          competenciaId: liga,
          competenciaNombre: 'Liga',
          partidosJugados: 1,
          ganados: 0,
          empatados: 1,
          perdidos: 0,
          golesFavor: 0,
          golesContra: 0,
          goleador: null,
        },
      ],
      cerrados: {
        [EQUIPO_1]: [partido('p1', `${temporadaActual()}-03-01`, liga)],
      },
      notas: {
        p1: [nota(JACOB_1, 'Jacob', 0)],
      },
    });

    const respuesta = await handler.tabla(undefined, 'user-1');

    expect(respuesta.texto).toContain('🏆 Liga');
    expect(respuesta.texto).not.toContain('⭐ MVP');
    expect(respuesta.texto).not.toContain('Goleador');
  });
});
