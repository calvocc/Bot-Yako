import type { MensajeEntrante, RespuestaBot } from '../channels/channel.types';
import { textoDePrueba } from '../channels/testing/fake.adapter';
import { FlowEngine, type ResultadoFlujo } from './flow-engine.service';
import { FlowRegistry } from './flow-registry.service';
import type { EstadoSesion, Flujo, Paso } from './flow.types';
import type { SesionStore } from './sesion.store';

/** Almacén de sesiones en memoria, con la misma interfaz que el real. */
class SesionesEnMemoria {
  private readonly datos = new Map<string, EstadoSesion>();

  leer(ref: { canal: string; canalUserId: string }) {
    return Promise.resolve(this.datos.get(`${ref.canal}:${ref.canalUserId}`) ?? null);
  }

  guardar(
    ref: { canal: string; canalUserId: string },
    estado: Omit<EstadoSesion, 'actualizadoEn'>,
  ) {
    this.datos.set(`${ref.canal}:${ref.canalUserId}`, {
      ...estado,
      actualizadoEn: new Date().toISOString(),
    });
    return Promise.resolve();
  }

  borrar(ref: { canal: string; canalUserId: string }) {
    this.datos.delete(`${ref.canal}:${ref.canalUserId}`);
    return Promise.resolve();
  }
}

/** Extrae la respuesta de un resultado del motor, fallando si no lo manejó. */
const respuestaDe = (resultado: ResultadoFlujo): RespuestaBot | null => {
  if (!resultado.manejado) throw new Error('esperaba que el flujo manejara el mensaje');
  return resultado.respuesta;
};

const paso = (id: string, definicion: Partial<Paso>): Paso => ({
  id,
  entrar: () => Promise.resolve({ respuesta: { texto: `paso ${id}` } }),
  ...definicion,
});

describe('FlowEngine', () => {
  let motor: FlowEngine;
  let registro: FlowRegistry;
  let sesiones: SesionesEnMemoria;
  let mensaje: MensajeEntrante;

  beforeEach(() => {
    registro = new FlowRegistry();
    sesiones = new SesionesEnMemoria();
    motor = new FlowEngine(registro, sesiones as unknown as SesionStore);
    mensaje = textoDePrueba('hola');
  });

  it('arranca en el paso inicial y espera al usuario', async () => {
    registro.registrar({
      id: 'alta',
      pasoInicial: 'nombre',
      pasos: [
        paso('nombre', {
          entrar: () => Promise.resolve({ respuesta: { texto: '¿Cómo se llama?' } }),
          recibir: () => Promise.resolve({ tipo: 'finalizar', respuesta: { texto: 'listo' } }),
        }),
      ],
    });

    const respuesta = await motor.iniciar(mensaje, 'alta');

    expect(respuesta?.texto).toBe('¿Cómo se llama?');
    expect(await motor.tieneFlujoActivo(mensaje)).toBe(true);
  });

  it('acumula datos entre pasos y los deja disponibles al final', async () => {
    let capturado: unknown;

    registro.registrar({
      id: 'alta',
      pasoInicial: 'nombre',
      pasos: [
        paso('nombre', {
          recibir: (ctx) =>
            Promise.resolve({ tipo: 'ir', pasoId: 'dorsal', datos: { nombre: ctx.mensaje.texto } }),
        }),
        paso('dorsal', {
          recibir: (ctx) => {
            capturado = { ...ctx.datos, dorsal: ctx.mensaje.texto };
            return Promise.resolve({ tipo: 'finalizar', respuesta: { texto: 'guardado' } });
          },
        }),
      ],
    });

    await motor.iniciar(mensaje, 'alta');
    await motor.continuar(textoDePrueba('Jacob'));
    const fin = respuestaDe(await motor.continuar(textoDePrueba('10')));

    expect(capturado).toEqual({ nombre: 'Jacob', dorsal: '10' });
    expect(fin?.texto).toBe('guardado');
    expect(await motor.tieneFlujoActivo(mensaje)).toBe(false);
  });

  it('repite el paso sin perder los datos cuando la respuesta no sirve', async () => {
    registro.registrar({
      id: 'alta',
      pasoInicial: 'dorsal',
      pasos: [
        paso('dorsal', {
          recibir: (ctx) =>
            Promise.resolve(
              /^\d+$/.test(ctx.mensaje.texto ?? '')
                ? { tipo: 'finalizar', respuesta: { texto: 'ok' } }
                : { tipo: 'repetir', respuesta: { texto: 'Necesito un número' } },
            ),
        }),
      ],
    });

    await motor.iniciar(mensaje, 'alta');
    const invalido = respuestaDe(await motor.continuar(textoDePrueba('diez')));

    expect(invalido?.texto).toBe('Necesito un número');
    expect(await motor.tieneFlujoActivo(mensaje)).toBe(true);

    const valido = respuestaDe(await motor.continuar(textoDePrueba('10')));
    expect(valido?.texto).toBe('ok');
  });

  it('encadena pasos que se resuelven solos sin escribirle al usuario', async () => {
    // Es el caso de RF-7.2: si el usuario pertenece a un solo equipo, el
    // selector decide y cede el turno sin preguntar nada.
    registro.registrar({
      id: 'cargar',
      pasoInicial: 'equipo',
      pasos: [
        paso('equipo', {
          entrar: () =>
            Promise.resolve({
              transicion: { tipo: 'ir', pasoId: 'accion', datos: { equipoId: 'unico' } },
            }),
        }),
        paso('accion', {
          entrar: (ctx) =>
            Promise.resolve({ respuesta: { texto: `equipo: ${String(ctx.datos.equipoId)}` } }),
        }),
      ],
    });

    const respuesta = await motor.iniciar(mensaje, 'cargar');

    expect(respuesta?.texto).toBe('equipo: unico');
  });

  it('corta y avisa si dos pasos se saltan entre sí en un ciclo', async () => {
    registro.registrar({
      id: 'ciclo',
      pasoInicial: 'a',
      pasos: [
        paso('a', { entrar: () => Promise.resolve({ transicion: { tipo: 'ir', pasoId: 'b' } }) }),
        paso('b', { entrar: () => Promise.resolve({ transicion: { tipo: 'ir', pasoId: 'a' } }) }),
      ],
    });

    await expect(motor.iniciar(mensaje, 'ciclo')).rejects.toThrow(/ciclo/i);
  });

  it('reporta que no manejó el mensaje si no hay conversación abierta', async () => {
    expect(await motor.continuar(mensaje)).toEqual({ manejado: false });
  });

  it('distingue "no había flujo" de "el flujo no tuvo nada que decir"', async () => {
    // Confundirlos hacía que terminar un flujo en silencio se respondiera con
    // "ese botón ya no está disponible".
    registro.registrar({
      id: 'silencioso',
      pasoInicial: 'unico',
      pasos: [
        paso('unico', {
          recibir: () => Promise.resolve({ tipo: 'finalizar' }),
        }),
      ],
    });

    await motor.iniciar(mensaje, 'silencioso');

    expect(await motor.continuar(textoDePrueba('lo que sea'))).toEqual({
      manejado: true,
      respuesta: null,
    });
  });

  it('descarta la sesión si el paso dejó de existir entre despliegues', async () => {
    await sesiones.guardar(
      { canal: mensaje.canal, canalUserId: mensaje.canalUserId },
      { flujoId: 'viejo', pasoId: 'ya-no-existe', datos: {} },
    );

    expect(await motor.continuar(mensaje)).toEqual({ manejado: false });
    expect(await motor.tieneFlujoActivo(mensaje)).toBe(false);
  });

  it('rechaza registrar un flujo cuyo paso inicial no existe', () => {
    const roto: Flujo = { id: 'roto', pasoInicial: 'fantasma', pasos: [paso('real', {})] };

    expect(() => registro.registrar(roto)).toThrow(/fantasma/);
  });
});
