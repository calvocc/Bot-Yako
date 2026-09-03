import type { ContextoFlujo, Paso, Transicion } from '../conversacion/flow.types';
import { textoDePrueba } from '../channels/testing/fake.adapter';
import type { JugadoresService } from './jugadores.service';
import { CLAVE_ALTAS, pasoCargarPlantilla } from './pasos-plantilla';

const crear = jest
  .fn<Promise<unknown>, [string, string, number | undefined]>()
  .mockImplementation((_equipoId, nombre, dorsal) =>
    Promise.resolve({ id: 'j1', nombre, dorsal: dorsal ?? null, activo: true }),
  );

const jugadoresFalsos = { crear } as unknown as JugadoresService;

const contexto = (texto: string): ContextoFlujo => ({
  mensaje: textoDePrueba(texto),
  datos: { equipoId: 'eq1', [CLAVE_ALTAS]: 0 },
  usuarioId: 'u1',
});

describe('pasoCargarPlantilla', () => {
  beforeEach(() => jest.clearAllMocks());

  const paso = (puedeEscribir?: () => Promise<boolean>): Paso =>
    pasoCargarPlantilla('plantilla', jugadoresFalsos, {
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
});
