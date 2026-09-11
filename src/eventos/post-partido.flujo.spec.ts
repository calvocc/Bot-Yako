import { seleccionDePrueba } from '../channels/testing/fake.adapter';
import type { ContextoFlujo, DatosFlujo, Transicion } from '../conversacion/flow.types';
import type { EventosService } from './eventos.service';
import type { Jugador, JugadoresService } from '../jugadores/jugadores.service';
import { pasoGoleadoresPost, type GanchosPostPartido } from './post-partido.flujo';

const jugador = (i: number): Jugador => ({
  id: `j${i}`,
  nombre: `Jugador ${i}`,
  dorsal: i,
  activo: true,
  posicion: null,
  fechaNacimiento: null,
  pesoKg: null,
  estaturaCm: null,
});

const jugadoresFalsos = (plantilla: Jugador[]): JugadoresService =>
  ({
    listar: jest.fn().mockResolvedValue(plantilla),
  }) as unknown as JugadoresService;

const eventosFalsos = { registrar: jest.fn() } as unknown as EventosService;

const ganchosFalsos: GanchosPostPartido = {
  datosPanel: () => ({}),
  partidoId: () => 'p1',
  siguePudiendoCargar: () => Promise.resolve(true),
  sinPermiso: () => ({ tipo: 'finalizar', respuesta: { texto: 'sin permiso' } }),
  partidoPerdido: () => ({ tipo: 'finalizar', respuesta: { texto: 'partido perdido' } }),
};

const contexto = (parcial: Partial<ContextoFlujo> = {}, datos: DatosFlujo = {}): ContextoFlujo => ({
  mensaje: seleccionDePrueba(''),
  datos: { equipoId: 'eq1', ...datos },
  usuarioId: 'u1',
  ...parcial,
});

describe('pasoGoleadoresPost — "Otro jugador" solo al final de la plantilla', () => {
  it('con poca plantilla, "Otro jugador" ya está en la primera (y única) página', async () => {
    const paso = pasoGoleadoresPost(
      'goles',
      'golesLibre',
      'siguiente',
      jugadoresFalsos([jugador(1), jugador(2)]),
      eventosFalsos,
      ganchosFalsos,
    );

    const entrada = await paso.entrar(contexto());

    if (!('respuesta' in entrada)) throw new Error('esperaba una respuesta');
    expect(entrada.respuesta.botones?.map((b) => b.id)).toEqual([
      'pj:j1',
      'pj:j2',
      'pp:otro',
      'pp:golesListo',
    ]);
  });

  it('con plantilla grande, "Otro jugador" no aparece mientras queda gente por ver', async () => {
    // Con 1 solo botón fijo reservado ("Listo") entran 8 por página: una
    // plantilla de 9 no cabe entera en la primera.
    const plantilla = Array.from({ length: 9 }, (_, i) => jugador(i + 1));
    const jugadores = jugadoresFalsos(plantilla);
    const paso = pasoGoleadoresPost(
      'goles',
      'golesLibre',
      'siguiente',
      jugadores,
      eventosFalsos,
      ganchosFalsos,
    );

    const entrada = await paso.entrar(contexto());

    if (!('respuesta' in entrada)) throw new Error('esperaba una respuesta');
    expect(entrada.respuesta.botones?.some((b) => b.id === 'pp:otro')).toBe(false);
    expect(entrada.respuesta.botones?.some((b) => b.id === 'pag:mas')).toBe(true);

    if (!paso.recibir) throw new Error('el paso no recibe mensajes');

    const datos = { equipoId: 'eq1', paginaGoleadoresPost: 0 };
    const siguiente: Transicion = await paso.recibir(
      contexto({ mensaje: seleccionDePrueba('pag:mas') }, datos),
    );

    if (siguiente.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(siguiente.respuesta.botones?.some((b) => b.id === 'pp:otro')).toBe(true);
    expect(siguiente.respuesta.botones?.some((b) => b.id === 'pag:mas')).toBe(false);
  });
});
