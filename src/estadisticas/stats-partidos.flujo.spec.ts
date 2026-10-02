import type { MensajeEntrante } from '../channels/channel.types';
import type { ContextoFlujo } from '../conversacion/flow.types';
import type { EquipoDelUsuario } from '../identidad/membresias.service';
import type { MembresiasService } from '../identidad/membresias.service';
import type { Jugador } from '../jugadores/jugadores.service';
import type { JugadoresService } from '../jugadores/jugadores.service';
import type { AlineacionService } from '../partidos/alineacion.service';
import type { Partido } from '../partidos/partido.mapper';
import type { PartidosService } from '../partidos/partidos.service';
import type { TiemposService } from '../partidos/tiempos.service';
import type { EventosService } from '../eventos/eventos.service';
import type { EstadisticasHandler } from './estadisticas.handler';
import { FLUJO_STATS_PARTIDOS, StatsPartidosFlujo } from './stats-partidos.flujo';

const EQUIPO_1 = '11111111-1111-1111-1111-111111111111';
const JACOB_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const equipo: EquipoDelUsuario = {
  equipoId: EQUIPO_1,
  equipoNombre: 'Sub-11',
  academiaId: 'academia-1',
  academiaNombre: 'Ringo Amaya',
  rol: 'viewer',
};

const jacob: Jugador = {
  id: JACOB_1,
  nombre: 'Jacob',
  dorsal: 10,
  activo: true,
  posicion: null,
  fechaNacimiento: null,
  pesoKg: null,
  estaturaCm: null,
};

function partido(id: string): Partido {
  return {
    id,
    equipoId: EQUIPO_1,
    rival: 'Tigres',
    fecha: '2026-09-14',
    estado: 'cerrado',
  } as unknown as Partido;
}

function mensaje(seleccionId?: string): MensajeEntrante {
  return {
    canal: 'telegram',
    canalUserId: 'user-1',
    chatId: 'user-1',
    nombre: 'Carlos',
    recibidoEn: new Date(),
    ...(seleccionId ? { seleccionId } : {}),
  };
}

function flujoDe(cerrados: Partido[] = [partido('p1')]): StatsPartidosFlujo {
  const membresias = {
    equiposDe: () => Promise.resolve([equipo]),
  } as unknown as MembresiasService;

  const jugadores = {
    listar: () => Promise.resolve([jacob]),
  } as unknown as JugadoresService;

  const partidos = {
    cerradosDe: () => Promise.resolve(cerrados),
  } as unknown as PartidosService;

  const tiempos = {
    contextoDeCarga: () => Promise.resolve({ minuto: { minuto: 58 } }),
  } as unknown as TiemposService;

  const alineacion = {
    datosDeParticipacion: () => ({
      participantes: [JACOB_1],
      minutos: new Map([[JACOB_1, 58]]),
    }),
  } as unknown as AlineacionService;

  const eventos = {
    delPartido: () => Promise.resolve([]),
  } as unknown as EventosService;

  const ficha = {
    stats: () => Promise.resolve({ texto: 'ficha' }),
  } as unknown as EstadisticasHandler;

  return new StatsPartidosFlujo(
    membresias,
    jugadores,
    partidos,
    tiempos,
    alineacion,
    eventos,
    ficha,
  );
}

const ctxLista = (datos = { statsJugadorId: JACOB_1 }): ContextoFlujo => ({
  mensaje: mensaje(),
  datos,
  usuarioId: 'user-1',
});

describe('StatsPartidosFlujo', () => {
  it('se registra con el id esperado', () => {
    expect(flujoDe().construir().id).toBe(FLUJO_STATS_PARTIDOS);
  });

  it('la lista muestra los partidos del jugador con botones', async () => {
    const [lista] = flujoDe().construir().pasos;
    const entrada = await lista.entrar(ctxLista());

    if (!('respuesta' in entrada)) throw new Error('esperaba respuesta');

    expect(entrada.respuesta.texto).toContain('📅 Partidos de Jacob #10 — Sub-11');
    expect(entrada.respuesta.texto).toContain("14/09 · vs Tigres · ⏱️ 58'");
    expect(entrada.respuesta.botones?.map((b) => b.id)).toEqual(['pp:p1']);
  });

  it('sin ficha en sus equipos finaliza sin mostrar nada', async () => {
    const [lista] = flujoDe().construir().pasos;
    const entrada = await lista.entrar(ctxLista({ statsJugadorId: 'otro' }));

    if (!('transicion' in entrada) || entrada.transicion.tipo !== 'finalizar') {
      throw new Error('esperaba finalizar');
    }

    expect(entrada.transicion.respuesta?.texto).toContain('No encontré');
  });

  it('tocar un partido lleva al detalle con volver', async () => {
    const flujo = flujoDe();
    const [, detalle] = flujo.construir().pasos;
    const [lista] = flujo.construir().pasos;

    const transicion = await lista.recibir!({
      mensaje: mensaje('pp:p1'),
      datos: { statsJugadorId: JACOB_1 },
      usuarioId: 'user-1',
    });

    expect(transicion).toMatchObject({ tipo: 'ir', pasoId: 'detalle' });

    const entrada = await detalle.entrar({
      mensaje: mensaje('pp:p1'),
      datos: { statsJugadorId: JACOB_1, statsPartidoId: 'p1' },
      usuarioId: 'user-1',
    });

    if (!('respuesta' in entrada)) throw new Error('esperaba respuesta');

    expect(entrada.respuesta.texto).toContain('⚽ Jacob #10 — 14/09/2026 · vs Tigres');
    expect(entrada.respuesta.botones?.map((b) => b.id)).toEqual(['pp:volver', 'pp:ficha']);
  });

  it('un partido ajeno no resuelve en el detalle', async () => {
    const [, detalle] = flujoDe([partido('p1')]).construir().pasos;
    const entrada = await detalle.entrar({
      mensaje: mensaje('pp:otro'),
      datos: { statsJugadorId: JACOB_1, statsPartidoId: 'otro' },
      usuarioId: 'user-1',
    });

    if (!('transicion' in entrada) || entrada.transicion.tipo !== 'finalizar') {
      throw new Error('esperaba finalizar');
    }

    expect(entrada.transicion.respuesta?.texto).toContain('No encontré');
  });
});
