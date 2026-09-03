import type { RedisService } from '../core/redis/redis.service';
import { AyudaHandler } from '../conversacion/ayuda.handler';
import { FlowEngine } from '../conversacion/flow-engine.service';
import { FlowRegistry } from '../conversacion/flow-registry.service';
import type { EstadoSesion } from '../conversacion/flow.types';
import { Router } from '../conversacion/router.service';
import type { SesionStore } from '../conversacion/sesion.store';
import { ChannelRegistry } from './channel.registry';
import type { Canal } from './channel.types';
import { ProcesadorMensajes } from './procesador-mensajes.service';
import { FakeChannelAdapter, seleccionDePrueba, textoDePrueba } from './testing/fake.adapter';

class SesionesEnMemoria {
  private readonly datos = new Map<string, EstadoSesion>();
  private clave = (r: { canal: string; canalUserId: string }) => `${r.canal}:${r.canalUserId}`;

  leer = (r: { canal: string; canalUserId: string }) =>
    Promise.resolve(this.datos.get(this.clave(r)) ?? null);

  guardar = (
    r: { canal: string; canalUserId: string },
    estado: Omit<EstadoSesion, 'actualizadoEn'>,
  ) => {
    this.datos.set(this.clave(r), { ...estado, actualizadoEn: new Date().toISOString() });
    return Promise.resolve();
  };

  borrar = (r: { canal: string; canalUserId: string }) => {
    this.datos.delete(this.clave(r));
    return Promise.resolve();
  };
}

/** Redis ausente: ejercita también el camino degradado (M3). */
const redisCaido = {
  disponible: false,
  intentar: () => Promise.resolve(null),
  ejecutar: () => Promise.resolve({ ok: false }),
} as unknown as RedisService;

/** Redis conectado pero cuyos comandos fallan: el caso peligroso del dedup. */
const redisQueFalla = {
  disponible: true,
  intentar: () => Promise.resolve(null),
  ejecutar: () => Promise.resolve({ ok: false }),
} as unknown as RedisService;

/** Redis sano que reporta la clave como ya existente. */
const redisConClaveExistente = {
  disponible: true,
  intentar: () => Promise.resolve(null),
  ejecutar: () => Promise.resolve({ ok: true, valor: null }),
} as unknown as RedisService;

function armar(canal: Canal = 'telegram', redis: RedisService = redisCaido) {
  const adaptador = new FakeChannelAdapter(canal);
  const canales = new ChannelRegistry();
  canales.registrar(adaptador);

  const registro = new FlowRegistry();
  const motor = new FlowEngine(registro, new SesionesEnMemoria() as unknown as SesionStore);
  const router = new Router(motor);

  const ayuda = new AyudaHandler(router);
  router.registrarComando('ayuda', { tipo: 'respuesta', ejecutar: () => ayuda.ejecutar() });

  const procesador = new ProcesadorMensajes(canales, router, redis);

  return { adaptador, procesador, router, registro, motor, canales };
}

describe('Conversación de punta a punta', () => {
  it('lista en /ayuda solo los comandos que existen de verdad', async () => {
    const { adaptador, procesador } = armar();

    await procesador.procesar(textoDePrueba('/ayuda'));

    expect(adaptador.enviados).toHaveLength(1);
    expect(adaptador.ultimoTexto).toContain('/ayuda');
    expect(adaptador.ultimoTexto).toContain('/cancelar');

    // Prometer comandos de fases futuras hace que el bot ofrezca cosas que
    // responden "No conozco el comando".
    expect(adaptador.ultimoTexto).not.toContain('/nuevopartido');
    expect(adaptador.ultimoTexto).not.toContain('/cargar');
  });

  it('suma comandos a /ayuda a medida que se registran', async () => {
    const { adaptador, procesador, router, registro } = armar();

    registro.registrar({
      id: 'partido',
      pasoInicial: 'rival',
      pasos: [
        {
          id: 'rival',
          entrar: () => Promise.resolve({ respuesta: { texto: '¿Contra quién?' } }),
          recibir: () => Promise.resolve({ tipo: 'finalizar' }),
        },
      ],
    });
    router.registrarComando('nuevopartido', { tipo: 'flujo', flujoId: 'partido' });

    await procesador.procesar(textoDePrueba('/ayuda'));

    expect(adaptador.ultimoTexto).toContain('/nuevopartido');
  });

  it('acepta la forma con mención que usa Telegram en grupos', async () => {
    const { adaptador, procesador } = armar();

    await procesador.procesar(textoDePrueba('/ayuda@YakoBot'));

    expect(adaptador.ultimoTexto).toContain('Soy Yako');
  });

  it('acusa recibo del botón antes de responder, para que no quede girando', async () => {
    const { adaptador, procesador } = armar();

    await procesador.procesar(seleccionDePrueba('cmd:ayuda'));

    expect(adaptador.acuses).toEqual(['cb-cmd:ayuda']);
    expect(adaptador.ultimoTexto).toContain('Soy Yako');
  });

  it('orienta al usuario ante un comando que no existe', async () => {
    const { adaptador, procesador } = armar();

    await procesador.procesar(textoDePrueba('/inventado'));

    expect(adaptador.ultimoTexto).toContain('No conozco el comando');
    expect(adaptador.ultimosBotones).toHaveLength(1);
  });

  it('avisa cuando se pulsa un botón de un mensaje viejo', async () => {
    const { adaptador, procesador } = armar();

    await procesador.procesar(seleccionDePrueba('ev:gol'));

    expect(adaptador.ultimoTexto).toContain('ya no está disponible');
  });

  it('un comando interrumpe la conversación en curso', async () => {
    const { adaptador, procesador, registro, router } = armar();

    registro.registrar({
      id: 'alta',
      pasoInicial: 'nombre',
      pasos: [
        {
          id: 'nombre',
          entrar: () => Promise.resolve({ respuesta: { texto: '¿Cómo se llama el equipo?' } }),
          recibir: () => Promise.resolve({ tipo: 'finalizar', respuesta: { texto: 'creado' } }),
        },
      ],
    });
    router.registrarComando('nuevoequipo', { tipo: 'flujo', flujoId: 'alta' });

    await procesador.procesar(textoDePrueba('/nuevoequipo'));
    expect(adaptador.ultimoTexto).toBe('¿Cómo se llama el equipo?');

    // A mitad del flujo, el usuario cambia de tema.
    await procesador.procesar(textoDePrueba('/ayuda'));
    expect(adaptador.ultimoTexto).toContain('Soy Yako');

    // Y ya no está atrapado en el flujo anterior.
    await procesador.procesar(textoDePrueba('Sub-11'));
    expect(adaptador.ultimoTexto).toContain('No estoy seguro');
  });

  it('/cancelar saca al usuario de un flujo a medias', async () => {
    const { adaptador, procesador, registro, router } = armar();

    registro.registrar({
      id: 'alta',
      pasoInicial: 'nombre',
      pasos: [
        {
          id: 'nombre',
          entrar: () => Promise.resolve({ respuesta: { texto: '¿Nombre?' } }),
          recibir: () => Promise.resolve({ tipo: 'finalizar' }),
        },
      ],
    });
    router.registrarComando('nuevoequipo', { tipo: 'flujo', flujoId: 'alta' });

    await procesador.procesar(textoDePrueba('/nuevoequipo'));
    await procesador.procesar(textoDePrueba('/cancelar'));

    expect(adaptador.ultimoTexto).toContain('cancelé');
  });

  it('no se cae si el flujo lanza: avisa al usuario', async () => {
    const { adaptador, procesador, registro, router } = armar();

    registro.registrar({
      id: 'roto',
      pasoInicial: 'x',
      pasos: [{ id: 'x', entrar: () => Promise.reject(new Error('falló la base')) }],
    });
    router.registrarComando('roto', { tipo: 'flujo', flujoId: 'roto' });

    await procesador.procesar(textoDePrueba('/roto'));

    expect(adaptador.ultimoTexto).toContain('Se me complicó');
  });

  it('no descarta el mensaje si Redis falla al chequear reentregas', async () => {
    // Un fallo del comando devuelve el mismo `null` que "la clave ya existía".
    // Tratarlos igual haría que un error transitorio de la caché dejara al
    // usuario sin respuesta y sin más rastro que un log de depuración.
    const { adaptador, procesador } = armar('telegram', redisQueFalla);

    await procesador.procesar(textoDePrueba('/ayuda'), 4242);

    expect(adaptador.enviados).toHaveLength(1);
    expect(adaptador.ultimoTexto).toContain('Soy Yako');
  });

  it('descarta la reentrega de un update ya procesado', async () => {
    const { adaptador, procesador } = armar('telegram', redisConClaveExistente);

    await procesador.procesar(textoDePrueba('/ayuda'), 4242);

    expect(adaptador.enviados).toHaveLength(0);
  });

  it('no deja escapar el error si el canal no tiene adaptador', async () => {
    // Resolver el adaptador fuera del try convertía esto en un rechazo sin
    // capturar, que en Node termina el proceso.
    const { procesador } = armar();

    await expect(
      procesador.procesar(textoDePrueba('/ayuda', { canal: 'whatsapp' })),
    ).resolves.toBeUndefined();
  });

  it('el mismo flujo funciona igual entrando por WhatsApp', async () => {
    // La prueba de que la lógica no depende del canal: mismo flujo, mismo
    // resultado, cambiando solo el adaptador.
    const { adaptador, procesador } = armar('whatsapp');

    await procesador.procesar(
      textoDePrueba('/ayuda', { canal: 'whatsapp', canalUserId: '+573001234567' }),
    );

    expect(adaptador.ultimoTexto).toContain('Soy Yako');
    expect(adaptador.ultimo.destino.canal).toBe('whatsapp');
  });
});
