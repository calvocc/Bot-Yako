import type { ContextoFlujo, Paso, Transicion } from '../conversacion/flow.types';
import { textoDePrueba } from '../channels/testing/fake.adapter';
import type { EquiposService } from '../equipos/equipos.service';
import type { JugadoresService } from './jugadores.service';
import { CLAVE_ALTAS, pasoCargarPlantilla } from './pasos-plantilla';

const crear = jest
  .fn<Promise<unknown>, [string, string, number | undefined]>()
  .mockImplementation((_equipoId, nombre, dorsal) =>
    Promise.resolve({ id: 'j1', nombre, dorsal: dorsal ?? null, activo: true }),
  );
const buscarVariosEnAcademia = jest.fn().mockResolvedValue([]);

const jugadoresFalsos = { crear, buscarVariosEnAcademia } as unknown as JugadoresService;

// Sin academia (equipo desconocido en este equipo falso): el paso no debe
// intentar el aviso de duplicado, solo el alta normal.
const equiposFalsos = { obtener: jest.fn().mockResolvedValue(null) } as unknown as EquiposService;

const contexto = (texto: string): ContextoFlujo => ({
  mensaje: textoDePrueba(texto),
  datos: { equipoId: 'eq1', [CLAVE_ALTAS]: 0 },
  usuarioId: 'u1',
});

describe('pasoCargarPlantilla', () => {
  beforeEach(() => jest.clearAllMocks());

  const paso = (puedeEscribir?: () => Promise<boolean>): Paso =>
    pasoCargarPlantilla('plantilla', jugadoresFalsos, equiposFalsos, {
      claveEquipoId: 'equipoId',
      alTerminar: () => ({ tipo: 'finalizar', respuesta: { texto: 'terminado' } }),
      puedeEscribir,
    });

  /** Entrega un texto al paso, fallando claro si el paso no espera respuesta. */
  const decir = (texto: string, puedeEscribir?: () => Promise<boolean>): Promise<Transicion> => {
    const actual = paso(puedeEscribir);

    if (!actual.recibir) throw new Error('el paso no recibe mensajes');

    return actual.recibir(contexto(texto));
  };

  it('termina con /listo', async () => {
    const t = await decir('/listo');

    expect(t).toMatchObject({ tipo: 'finalizar' });
  });

  it('termina con la forma de grupo /listo@YakoBot', async () => {
    // Telegram agrega el @bot en los grupos. Comparando el texto crudo, esto
    // se guardaba como un jugador llamado "/listo@YakoBot" y no había forma
    // de salir del paso.
    const t = await decir('/listo@YakoBot');

    expect(t).toMatchObject({ tipo: 'finalizar' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('no da de alta a nadie cuyo nombre empiece por barra', async () => {
    const t = await decir('/saltar');

    expect(t.tipo).toBe('repetir');
    expect(crear).not.toHaveBeenCalled();
  });

  it('da de alta un jugador normal', async () => {
    const t = await decir('Jacob, 10');

    expect(t.tipo).toBe('repetir');
    expect(crear).toHaveBeenCalledWith('eq1', 'Jacob', 10);
  });

  it('corta si el permiso se revocó a mitad del flujo', async () => {
    const t = await decir('Jacob, 10', () => Promise.resolve(false));

    expect(t).toMatchObject({ tipo: 'finalizar' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('avisa (sin bloquear) si ya existe alguien con ese nombre en otro equipo de la academia', async () => {
    const equiposConAcademia = {
      obtener: jest.fn().mockResolvedValue({ academiaId: 'ac1' }),
    } as unknown as EquiposService;
    const buscarVariosEnAcademiaConMatch = jest
      .fn()
      .mockResolvedValue([{ jugadorId: 'jOtro', nombre: 'Jacob', equipoNombre: 'Sub-9' }]);
    const jugadoresConMatch = {
      crear,
      buscarVariosEnAcademia: buscarVariosEnAcademiaConMatch,
    } as unknown as JugadoresService;

    const paso2 = pasoCargarPlantilla('plantilla', jugadoresConMatch, equiposConAcademia, {
      claveEquipoId: 'equipoId',
      alTerminar: () => ({ tipo: 'finalizar', respuesta: { texto: 'terminado' } }),
    });

    if (!paso2.recibir) throw new Error('el paso no recibe mensajes');
    const t = await paso2.recibir(contexto('Jacob, 10'));

    expect(crear).toHaveBeenCalledWith('eq1', 'Jacob', 10);
    expect(buscarVariosEnAcademiaConMatch).toHaveBeenCalledWith('ac1', ['Jacob'], 'eq1');
    if (t.tipo !== 'repetir') throw new Error('esperaba repetir');
    expect(t.respuesta.texto).toContain('❓');
    expect(t.respuesta.texto).toContain('Sub-9');
    // El aviso no bloquea el alta: el jugador queda agregado igual.
    expect(t.respuesta.texto).toContain('✅');
  });
});
