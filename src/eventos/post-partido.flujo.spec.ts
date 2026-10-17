import { seleccionDePrueba } from '../channels/testing/fake.adapter';
import type { ContextoFlujo, DatosFlujo } from '../conversacion/flow.types';
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

describe('pasoGoleadoresPost — plantilla completa, sin paginar', () => {
  it('con poca plantilla, ofrece "Otro jugador" y "Listo" al final', async () => {
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

  it('con plantilla grande, muestra a todos y "Otro jugador" en el mismo mensaje', async () => {
    const plantilla = Array.from({ length: 22 }, (_, i) => jugador(i + 1));
    const paso = pasoGoleadoresPost(
      'goles',
      'golesLibre',
      'siguiente',
      jugadoresFalsos(plantilla),
      eventosFalsos,
      ganchosFalsos,
    );

    const entrada = await paso.entrar(contexto());

    if (!('respuesta' in entrada)) throw new Error('esperaba una respuesta');
    const ids = entrada.respuesta.botones?.map((b) => b.id) ?? [];

    expect(ids).toHaveLength(22 + 2);
    expect(ids).toContain('pj:j22');
    expect(ids).toContain('pp:otro');
    expect(ids).not.toContain('pag:mas');
  });
});
