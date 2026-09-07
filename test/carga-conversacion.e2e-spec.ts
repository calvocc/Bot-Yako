import { sql } from 'drizzle-orm';
import { Test, type TestingModule } from '@nestjs/testing';
import { AcademiasService } from '../src/academias/academias.service';
import { ChannelRegistry } from '../src/channels/channel.registry';
import { ProcesadorMensajes } from '../src/channels/procesador-mensajes.service';
import {
  FakeChannelAdapter,
  seleccionDePrueba,
  textoDePrueba,
} from '../src/channels/testing/fake.adapter';
import { ConfigModule } from '../src/config/config.module';
import { ConversacionModule } from '../src/conversacion/conversacion.module';
import { RedisModule } from '../src/core/redis/redis.module';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { EquiposService } from '../src/equipos/equipos.service';
import { EventosService } from '../src/eventos/eventos.service';
import { IdentidadModule } from '../src/identidad/identidad.module';
import { IdentidadService } from '../src/identidad/identidad.service';
import { JugadoresService } from '../src/jugadores/jugadores.service';
import { OrganizacionModule } from '../src/organizacion.module';
import { PartidosModule } from '../src/partidos.module';
import { PartidosService } from '../src/partidos/partidos.service';

/**
 * La conversación de un domingo, tal como la vería un papá en el chat.
 *
 * Los servicios ya están probados aparte; lo que se ejercita acá es el flujo:
 * que el panel se edite en el sitio en vez de apilarse, que cada evento deje su
 * línea de bitácora, y que las cuatro bifurcaciones de `/cargar` lleven a donde
 * dicen.
 */
describe('Carga en vivo, conversación completa (e2e)', () => {
  let app: TestingModule;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;
  let db: DbService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let jugadores: JugadoresService;
  let identidad: IdentidadService;
  let partidos: PartidosService;
  let eventos: EventosService;

  let siguiente = 1;
  const nuevoCanal = () => {
    const id = String(980000 + siguiente++);
    return { canalUserId: id, chatId: id };
  };

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        ConfigModule,
        DbModule,
        RedisModule,
        ConversacionModule,
        IdentidadModule,
        OrganizacionModule,
        PartidosModule,
      ],
      providers: [ChannelRegistry, ProcesadorMensajes],
    }).compile();

    await app.init();

    adaptador = new FakeChannelAdapter('telegram');
    app.get(ChannelRegistry).registrar(adaptador);
    procesador = app.get(ProcesadorMensajes);
    db = app.get(DbService);
    academias = app.get(AcademiasService);
    equipos = app.get(EquiposService);
    jugadores = app.get(JugadoresService);
    identidad = app.get(IdentidadService);
    partidos = app.get(PartidosService);
    eventos = app.get(EventosService);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'CONV %'`);
    await app.close();
  });

  beforeEach(() => adaptador.limpiar());

  /** Academia + equipo + plantilla, con el usuario ya como admin. */
  const escenario = async (nombre: string) => {
    const canal = nuevoCanal();
    const usuarioId = await identidad.resolverUsuario(textoDePrueba('', canal));
    const academia = await academias.crear(`CONV ${nombre}`);
    const equipo = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      usuarioId,
    );

    await jugadores.crear(equipo.id, 'Jacob', 10);
    await jugadores.crear(equipo.id, 'Andrés', 7);

    // El id del mensaje que lleva los botones, que es lo que Telegram manda
    // como `mensajeOrigenId` al tocar uno. Se recuerda aparte porque la
    // bitácora deja mensajes sin botones después del panel, y porque los tests
    // limpian el adaptador entre pasos.
    let conBotones = '1';
    const recordarPanel = () => {
      const ultimo = [...adaptador.enviados].reverse().find((e) => e.respuesta.botones?.length);

      if (ultimo) conBotones = ultimo.mensajeId;
    };

    const decir = async (texto: string) => {
      await procesador.procesar(textoDePrueba(texto, canal));
      recordarPanel();
    };

    const tocar = async (id: string) => {
      await procesador.procesar(seleccionDePrueba(id, { ...canal, mensajeOrigenId: conBotones }));
      recordarPanel();
    };

    return { canal, usuarioId, academia, equipo, decir, tocar };
  };

  /**
   * Desde la pregunta de modo (sin titular todavía), entra a elegirla, toca
   * el botón de cada nombre pedido y confirma.
   *
   * Elegir titular no arranca el partido por sí sola: solo la guarda y
   * vuelve al paso `modo`, que recién ahí ofrece "En vivo" (antes, sin
   * titular, ese botón era "👥 Elegir titular").
   */
  const elegirTitulares = async (
    tocar: (id: string) => Promise<void>,
    nombres: string[],
  ): Promise<void> => {
    await tocar('md:titular');

    for (const nombre of nombres) {
      const boton = adaptador.ultimosBotones.find((b) => b.texto.startsWith(nombre));

      if (!boton) throw new Error(`No encontré el botón de ${nombre} para la titular`);

      await tocar(boton.id);
    }

    await tocar('sm:listo');
  };

  it('crea un partido con /nuevopartido', async () => {
    const { equipo, decir, tocar } = await escenario('Nuevo partido');

    await decir('/nuevopartido');
    expect(adaptador.ultimoTexto).toContain('¿Contra quién juegan?');

    await decir('Deportivo Norte');
    expect(adaptador.ultimoTexto).toContain('¿Qué día se juega?');

    await tocar(adaptador.ultimosBotones[0].id); // Hoy
    expect(adaptador.ultimoTexto).toContain('¿En qué competencia?');

    await decir('Liga del Atlántico');
    expect(adaptador.ultimoTexto).toContain('2 tiempos x 25 min');

    await tocar('fmt:habitual');
    expect(adaptador.ultimoTexto).toContain('Partido creado ✅');

    const creados = await partidos.abiertosDe(equipo.id);
    expect(creados).toHaveLength(1);
    expect(creados[0]).toMatchObject({
      rival: 'Deportivo Norte',
      competenciaNombre: 'Liga del Atlántico',
    });
  });

  it('carga un gol y deja el panel editado más la línea de bitácora', async () => {
    const { equipo, decir, tocar } = await escenario('Gol');
    await crearPartido(equipo.id);

    await decir('/cargar');
    expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');

    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
    expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');

    await tocar('md:vivo');
    expect(adaptador.ultimoTexto).toContain('Arrancó el Tiempo 1');
    expect(adaptador.ultimoTexto).toContain('vs Deportivo Norte');

    await tocar('ev:gol');
    expect(adaptador.ultimoTexto).toContain('¿De qué equipo?');
    // Cada interacción manda un mensaje nuevo: ya no queda panel que editar.
    expect(adaptador.ultimo.fueEdicion).toBe(false);

    await tocar('or:propio');
    expect(adaptador.ultimoTexto).toContain('¿Quién?');

    const jacob = adaptador.ultimosBotones.find((b) => b.texto.startsWith('Jacob'));
    expect(jacob).toBeDefined();

    adaptador.limpiar();
    await tocar(jacob!.id);

    // Un solo mensaje nuevo: la bitácora del gol y el panel viajan juntos.
    expect(adaptador.enviados).toHaveLength(1);
    expect(adaptador.enviados[0].fueEdicion).toBe(false);
    expect(adaptador.enviados[0].respuesta.texto).toMatch(/⚽ Gol de Jacob #10, min \d+ — 1-0/);
    expect(adaptador.enviados[0].respuesta.texto).toContain('1-0');
  });

  it('entra directo al panel si el partido ya está en vivo (4b)', async () => {
    const { equipo, decir, tocar } = await escenario('Ya en vivo');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await elegirTitulares(tocar, ['Jacob']);
    await tocar('md:vivo');
    await decir('/cancelar');

    adaptador.limpiar();
    await decir('/cargar');

    expect(adaptador.ultimoTexto).toContain('ya está en vivo');
    expect(adaptador.ultimosBotones.map((b) => b.id)).toContain('ev:gol');
  });

  it('deriva a /reabrir cuando el partido está cerrado (4d)', async () => {
    const { equipo, usuarioId, decir } = await escenario('Cerrado');
    const partido = await crearPartido(equipo.id);
    await partidos.cerrar(partido.id, usuarioId, { propio: 1, rival: 0 });

    await decir('/cargar');

    expect(adaptador.ultimoTexto).toContain('Este equipo no tiene partidos abiertos');
  });

  it('un partido reabierto vuelve a aparecer en /cargar aunque se haya creado hace más de un día', async () => {
    const { equipo, usuarioId, decir } = await escenario('Reabierto viejo');
    const partido = await crearPartido(equipo.id);

    // Simula un partido creado hace varios días: creadoEn viejo por sí solo
    // ya no saca a un partido de /cargar (ver PartidosService.abiertosDe) --
    // lo que importa es si tiene un reloj corriendo, y este no lo tiene.
    await db.db.execute(
      sql`update partidos set creado_en = now() - interval '3 days' where id = ${partido.id}`,
    );
    await partidos.cerrar(partido.id, usuarioId, { propio: 1, rival: 0 });

    // Cerrado: no aparece en /cargar, como en el test de arriba.
    await decir('/cargar');
    expect(adaptador.ultimoTexto).toContain('Este equipo no tiene partidos abiertos');

    const reabierto = await partidos.reabrir(partido.id);
    expect(reabierto.tipo).toBe('reabierto');

    // Reabierto, aunque siga siendo "viejo" por creadoEn, tiene que volver a
    // ofrecerse: la idea de /reabrir es justamente poder editarlo con /cargar.
    const abiertos = await partidos.abiertosDe(equipo.id);
    expect(abiertos.map((p) => p.id)).toContain(partido.id);

    adaptador.limpiar();
    await decir('/cargar');
    expect(adaptador.ultimoTexto).not.toContain('Este equipo no tiene partidos abiertos');
  });

  it('un partido post partido sin tocar hace más de un día sigue apareciendo en /cargar', async () => {
    // Caso real reportado: un partido cargado post partido (nunca corre
    // reloj) que lleva más de un día sin tocarse, sin haberse cerrado ni
    // reabierto nunca -- antes quedaba invisible en /cargar igual, sin que
    // corriera ningún riesgo real (ver el comentario de abiertosDe).
    const { equipo, decir } = await escenario('Post partido viejo');
    const partido = await crearPartido(equipo.id);

    await db.db.execute(
      sql`update partidos
          set modo_carga = 'post_partido', tiempo_estado = 'finalizado', creado_en = now() - interval '3 days'
          where id = ${partido.id}`,
    );

    const abiertos = await partidos.abiertosDe(equipo.id);
    expect(abiertos.map((p) => p.id)).toContain(partido.id);

    await decir('/cargar');
    expect(adaptador.ultimoTexto).not.toContain('Este equipo no tiene partidos abiertos');
  });

  it('un partido en vivo con el reloj corriendo hace más de un día deja de ofrecerse en /cargar', async () => {
    // La protección original (PR #19): un partido que alguien dejó con el
    // reloj corriendo (el bot se cayó, nadie tocó "Finalizar") no puede
    // seguir ofreciéndose para siempre -- su minuto seguiría creciendo sin
    // freno. Se sigue cumpliendo con el nuevo criterio (tiempoIniciadoEn),
    // solo que ahora aplica de verdad solo mientras el reloj sigue corriendo.
    const { equipo, decir, tocar } = await escenario('Reloj viejo');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await elegirTitulares(tocar, ['Jacob']);
    await tocar('md:vivo');
    expect(adaptador.ultimoTexto).toContain('Arrancó el Tiempo 1');

    const partido = (await partidos.abiertosDe(equipo.id))[0];

    await db.db.execute(
      sql`update partidos set tiempo_iniciado_en = now() - interval '3 days' where id = ${partido.id}`,
    );

    const abiertos = await partidos.abiertosDe(equipo.id);
    expect(abiertos.map((p) => p.id)).not.toContain(partido.id);

    adaptador.limpiar();
    await decir('/cargar');
    expect(adaptador.ultimoTexto).toContain('Este equipo no tiene partidos abiertos');
  });

  it('/deshacer quita el último evento propio y lo cuenta', async () => {
    const { equipo, usuarioId, decir, tocar } = await escenario('Deshacer');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
    await tocar('md:vivo');
    await tocar('ev:gol');
    await tocar('or:propio');
    await tocar(adaptador.ultimosBotones.find((b) => b.texto.startsWith('Jacob'))!.id);

    adaptador.limpiar();
    await decir('/deshacer');

    const textos = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
    expect(textos).toContain('Se eliminó');
    expect(textos).toContain('0-0');

    const partido = (await partidos.abiertosDe(equipo.id))[0];
    expect(await eventos.delPartido(partido.id)).toHaveLength(0);
    expect(usuarioId).toBeTruthy();
  });

  it('/finalizar cierra con el marcador corregido y manda el resumen', async () => {
    const { equipo, decir, tocar } = await escenario('Finalizar');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
    await tocar('md:vivo');
    await tocar('ev:gol');
    await tocar('or:propio');
    await tocar(adaptador.ultimosBotones.find((b) => b.texto.startsWith('Jacob'))!.id);

    adaptador.limpiar();
    await decir('/finalizar');
    expect(adaptador.ultimoTexto).toContain('¿Confirmas el marcador final? 1-0');

    // Escribir el marcador corrige y confirma en un solo paso.
    await decir('3-1');

    const textos = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
    expect(textos).toContain('Partido cerrado ✅');
    expect(textos).toContain('3 - 1');

    // El resumen llega como mensaje aparte, para poder reenviarlo al grupo.
    expect(adaptador.enviados.at(-1)?.respuesta.texto).toContain('🏆');

    const partido = (await partidos.recientesDe(equipo.id))[0];
    expect(partido.estado).toBe('cerrado');
    expect(partido.marcadorPropioConfirmado).toBe(3);
  });

  it('da de alta al jugador que no estaba en la plantilla', async () => {
    const { equipo, decir, tocar } = await escenario('Jugador nuevo');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
    await tocar('md:vivo');
    await tocar('ev:gol');
    await tocar('or:propio');
    await tocar('jg:otro');

    adaptador.limpiar();
    await decir('Samuel, 4');

    const textos = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
    expect(textos).toContain('Gol de Samuel #4');
    expect(textos).toContain('quedó agregado a la plantilla');

    // Un solo mensaje nuevo: la bitácora (con la nota del alta) y el panel
    // viajan juntos, sin depender de ningún mensaje anterior que editar.
    expect(adaptador.enviados).toHaveLength(1);
    expect(adaptador.enviados[0].fueEdicion).toBe(false);

    const plantilla = await jugadores.listar(equipo.id);
    expect(plantilla.map((j) => j.nombre)).toContain('Samuel');
  });

  it('un nombre que ya juega en otro equipo de la academia pide confirmar antes de crear', async () => {
    const { usuarioId, academia, equipo: sub11, decir, tocar } = await escenario('Vínculo');
    // Jacob ya existe en Sub-11 (lo crea `escenario`). El mismo usuario admin
    // también dirige Sub-13 — un DT con dos categorías, caso real.
    const sub13 = await equipos.crear(
      academia.id,
      'Sub-13',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      usuarioId,
    );
    await jugadores.crear(sub13.id, 'Local', 1);
    await crearPartido(sub13.id);

    await decir('/cargar');
    // Dos equipos elegibles: hay que elegir Sub-13 explícitamente.
    const botonSub13 = adaptador.ultimosBotones.find((b) => b.texto.includes('Sub-13'));
    await tocar(botonSub13!.id);

    await elegirTitulares(tocar, ['Local']);
    await tocar('md:vivo');
    await tocar('ev:gol');
    await tocar('or:propio');
    await tocar('jg:otro');

    await decir('Jacob');
    expect(adaptador.ultimoTexto).toContain('¿Es el mismo Jacob que ya juega en Sub-11?');

    await tocar('ok:si');

    const textos = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
    expect(textos).toContain('Gol de Jacob');
    expect(textos).toContain('quedó vinculado a esta plantilla — ya jugaba en Sub-11');

    // Sub-13 tiene su propia ficha de Jacob (sin dorsal — el #10 de Sub-11
    // no dice nada de si está libre acá), enlazada por persona a la de Sub-11.
    const plantillaSub13 = await jugadores.listar(sub13.id);
    const jacobEnSub13 = plantillaSub13.find((j) => j.nombre === 'Jacob');
    expect(jacobEnSub13).toBeDefined();

    const plantillaSub11 = await jugadores.listar(sub11.id);
    expect(plantillaSub11.find((j) => j.nombre === 'Jacob')?.id).not.toBe(jacobEnSub13?.id);
  });

  it('con dos candidatos del mismo nombre en la academia, crea sin vincular en vez de adivinar', async () => {
    const { usuarioId, academia, decir, tocar } = await escenario('Vínculo ambiguo');
    // Segundo "Jacob", sin relación con el de Sub-11 (creado por `escenario`).
    const sub11B = await equipos.crear(
      academia.id,
      'Sub-11-B',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      usuarioId,
    );
    await jugadores.crear(sub11B.id, 'Jacob', 9);

    const sub13 = await equipos.crear(
      academia.id,
      'Sub-13',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      usuarioId,
    );
    await jugadores.crear(sub13.id, 'Local', 1);
    await crearPartido(sub13.id);

    await decir('/cargar');
    const botonSub13 = adaptador.ultimosBotones.find((b) => b.texto.includes('Sub-13'));
    await tocar(botonSub13!.id);

    await elegirTitulares(tocar, ['Local']);
    await tocar('md:vivo');
    await tocar('ev:gol');
    await tocar('or:propio');
    await tocar('jg:otro');

    // Hay un "Jacob" en Sub-11 (creado por `escenario`) y otro en Sub-11-B:
    // sin forma segura de elegir uno solo, no debe preguntar por ninguno —
    // crea una ficha nueva sin vínculo, directo.
    await decir('Jacob');
    expect(adaptador.ultimoTexto).not.toContain('¿Es el mismo Jacob');
    expect(adaptador.ultimoTexto).toContain('Gol de Jacob');

    const plantillaSub13 = await jugadores.listar(sub13.id);
    const jacobesEnSub13 = plantillaSub13.filter((j) => j.nombre === 'Jacob');
    expect(jacobesEnSub13).toHaveLength(1);

    const filas = await db.db.execute(
      sql`select persona_id from jugadores where id = ${jacobesEnSub13[0].id}`,
    );
    expect(filas[0].persona_id).toBeNull();
  });

  it('no deja arrancar en vivo sin elegir al menos un titular', async () => {
    const { equipo, decir, tocar } = await escenario('Sin titular');
    await crearPartido(equipo.id);

    await decir('/cargar');
    expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');

    await tocar('md:titular');
    expect(adaptador.ultimoTexto).toContain('Elige la titular');

    await tocar('sm:listo');
    expect(adaptador.ultimoTexto).toContain('Elige al menos uno.');

    const partido = (await partidos.abiertosDe(equipo.id))[0];
    expect(partido.modoCarga).toBeNull();
  });

  it('no deja elegir titular a quien perdió el rol de editor', async () => {
    const { equipo, usuarioId, decir, tocar } = await escenario('Sin permiso elegir titular');
    await crearPartido(equipo.id);

    await decir('/cargar');

    // El rol se revoca justo antes de tocar "Elegir titular" -- mismo
    // patrón de revalidación que el resto del flujo.
    await db.db.execute(
      sql`delete from usuarios_equipos where equipo_id = ${equipo.id} and usuario_id = ${usuarioId}`,
    );

    await tocar('md:titular');
    expect(adaptador.ultimoTexto).toContain('Ya no tienes permiso');

    const partido = (await partidos.abiertosDe(equipo.id))[0];
    expect(partido.modoCarga).toBeNull();

    const [{ n }] = await db.db.execute<{ n: number }>(
      sql`select count(*)::int as n from partido_titulares where partido_id = ${partido.id}`,
    );
    expect(n).toBe(0);
  });

  it('no deja confirmar la titular a quien perdió el rol entre elegir y confirmar', async () => {
    const { equipo, usuarioId, decir, tocar } = await escenario('Sin permiso confirmar titular');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:titular');

    const jacob = adaptador.ultimosBotones.find((b) => b.texto.startsWith('Jacob'));
    await tocar(jacob!.id);

    // El rol se revoca justo antes de confirmar -- la escritura de
    // `guardarTitulares` tiene que revalidar, igual que cualquier otro paso
    // que escribe.
    await db.db.execute(
      sql`delete from usuarios_equipos where equipo_id = ${equipo.id} and usuario_id = ${usuarioId}`,
    );

    await tocar('sm:listo');
    expect(adaptador.ultimoTexto).toContain('Ya no tienes permiso');

    const partido = (await partidos.abiertosDe(equipo.id))[0];
    expect(partido.modoCarga).toBeNull();

    const [{ n }] = await db.db.execute<{ n: number }>(
      sql`select count(*)::int as n from partido_titulares where partido_id = ${partido.id}`,
    );
    expect(n).toBe(0);
  });

  it('elegir la titular edita el mismo mensaje en vez de apilar uno por jugador', async () => {
    const { equipo, decir, tocar } = await escenario('Titular sin apilar');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:titular');

    const jacob = adaptador.ultimosBotones.find((b) => b.texto.startsWith('Jacob'));

    adaptador.limpiar();
    await tocar(jacob!.id);

    // Un solo mensaje editado, no uno nuevo, por cada jugador marcado.
    expect(adaptador.enviados).toHaveLength(1);
    expect(adaptador.enviados[0].fueEdicion).toBe(true);

    const idPanel = adaptador.enviados[0].mensajeId;

    const andres = adaptador.ultimosBotones.find((b) => b.texto.startsWith('Andrés'));
    await tocar(andres!.id);

    expect(adaptador.enviados.at(-1)?.mensajeId).toBe(idPanel);
    expect(adaptador.enviados.at(-1)?.fueEdicion).toBe(true);
  });

  it('"Todos" marca a todo el plantel de una, sin tocar jugador por jugador', async () => {
    const { equipo, decir, tocar } = await escenario('Titular todos');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:titular');

    await tocar('sm:todos');
    expect(adaptador.ultimosBotones.find((b) => b.id === 'sm:listo')?.texto).toBe('Listo (2)');

    await tocar('sm:listo');
    expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');

    await tocar('md:vivo');
    expect(adaptador.ultimoTexto).toContain('Arrancó el Tiempo 1');
  });

  it('escribir los dorsales elige la titular sin tocar botones', async () => {
    const { equipo, decir, tocar } = await escenario('Titular por dorsal');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:titular');

    await decir('10, 7');
    expect(adaptador.ultimosBotones.find((b) => b.id === 'sm:listo')?.texto).toBe('Listo (2)');

    await tocar('sm:listo');
    expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');

    await tocar('md:vivo');
    expect(adaptador.ultimoTexto).toContain('Arrancó el Tiempo 1');
  });

  it('un dorsal que no existe se marca aparte, sin descartar los que sí matchean', async () => {
    const { equipo, decir, tocar } = await escenario('Titular dorsal parcial');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:titular');

    // 14 no es dorsal de nadie en esta plantilla: solo Jacob (10) debe quedar
    // marcado, con un aviso de que "14" no se reconoció — no en silencio.
    await decir('10, 14');
    expect(adaptador.ultimoTexto).toContain('No reconocí: 14');
    expect(adaptador.ultimosBotones.find((b) => b.id === 'sm:listo')?.texto).toBe('Listo (1)');

    await tocar('sm:listo');
    expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');

    await tocar('md:vivo');
    expect(adaptador.ultimoTexto).toContain('Arrancó el Tiempo 1');
  });

  it('cambio: sale de la cancha, entra del resto, y el siguiente evento ya no ofrece a quien salió', async () => {
    const { equipo, decir, tocar } = await escenario('Cambio');
    await crearPartido(equipo.id);

    await decir('/cargar');
    // Solo Jacob titular: Andrés queda en la banca, así se puede distinguir
    // "en cancha" de "el resto de la plantilla".
    await elegirTitulares(tocar, ['Jacob']);
    await tocar('md:vivo');

    await tocar('ev:cambio');
    expect(adaptador.ultimoTexto).toContain('¿Quién sale?');

    const botonesSale = adaptador.ultimosBotones.map((b) => b.texto);
    expect(botonesSale.some((t) => t.startsWith('Jacob'))).toBe(true);
    expect(botonesSale.some((t) => t.startsWith('Andrés'))).toBe(false);

    await tocar(adaptador.ultimosBotones.find((b) => b.texto.startsWith('Jacob'))!.id);
    expect(adaptador.ultimoTexto).toContain('¿Quién entra?');

    const botonesEntra = adaptador.ultimosBotones.map((b) => b.texto);
    expect(botonesEntra.some((t) => t.startsWith('Andrés'))).toBe(true);
    expect(botonesEntra.some((t) => t.startsWith('Jacob'))).toBe(false);

    const idAndres = adaptador.ultimosBotones.find((b) => b.texto.startsWith('Andrés'))!.id;

    adaptador.limpiar();
    await tocar(idAndres);

    const textoCambio = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
    expect(textoCambio).toContain('🔄 Cambio: sale Jacob #10, entra Andrés #7');

    // Con Jacob afuera de la cancha, el próximo "¿Quién?" ya no lo ofrece.
    await tocar('ev:gol');
    await tocar('or:propio');

    const botonesQuien = adaptador.ultimosBotones.map((b) => b.texto);
    expect(botonesQuien.some((t) => t.startsWith('Andrés'))).toBe(true);
    expect(botonesQuien.some((t) => t.startsWith('Jacob'))).toBe(false);
  });

  it('cambio: escribir el nombre de quien ya está en cancha (o el que sale) se rechaza', async () => {
    const { equipo, decir, tocar } = await escenario('Cambio nombre en cancha');
    await crearPartido(equipo.id);

    await decir('/cargar');
    // Los dos titulares: no queda nadie en la banca, así que "¿Quién entra?"
    // solo ofrece "Otro jugador" — cualquier nombre escrito tiene que
    // resolverse contra quien ya está jugando, no contra un botón.
    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
    await tocar('md:vivo');

    await tocar('ev:cambio');
    await tocar(adaptador.ultimosBotones.find((b) => b.texto.startsWith('Jacob'))!.id);
    expect(adaptador.ultimoTexto).toContain('¿Quién entra?');

    // Alguien que sigue en cancha (Andrés, que no sale) no puede "entrar".
    await decir('Andrés');
    expect(adaptador.ultimoTexto).toContain('Andrés ya está en cancha.');

    // Ni el propio jugador que está saliendo: sigue en cancha hasta que el
    // cambio se registre, así que escribir su nombre cae en el mismo freno
    // en vez de chocar contra el check de la base (jugador_id <>
    // jugador_entra_id) con un error crudo.
    await decir('Jacob');
    expect(adaptador.ultimoTexto).toContain('Jacob ya está en cancha.');

    // Alguien nuevo sí puede entrar.
    adaptador.limpiar();
    await decir('Samuel, 4');

    const textos = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
    expect(textos).toContain('🔄 Cambio: sale Jacob #10, entra Samuel #4');
  });

  describe('post partido (RF-4)', () => {
    /** Devuelve el id del botón de la plantilla que empieza con `nombre`. */
    const botonDe = (nombre: string): string =>
      adaptador.ultimosBotones.find((b) => b.texto.startsWith(nombre))!.id;

    /**
     * Tras "Post partido", el paso nuevo pide quiénes jugaron antes de
     * ofrecer goleadores/tarjetas (mínimo 1, ver `pasoParticipantesPost`).
     * "Todos" alcanza para la mayoría de estos tests: lo que prueban es la
     * carga de eventos, no la selección de plantel en sí (esa la prueban
     * los dos tests de acá abajo).
     */
    const elegirParticipantesPost = async (tocar: (id: string) => Promise<void>): Promise<void> => {
      await tocar('sm:todos');
      await tocar('sm:listo');
    };

    it('exige elegir al menos un participante antes de ofrecer goleadores', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido participantes obligatorio');
      await crearPartido(equipo.id);

      await decir('/cargar');
      await tocar('md:post');
      expect(adaptador.ultimoTexto).toContain('¿Quiénes jugaron este partido?');

      // Confirmar sin marcar a nadie no debe dejar avanzar a goleadores.
      await tocar('sm:listo');
      expect(adaptador.ultimoTexto).toContain('Elige al menos uno.');
      expect(adaptador.ultimoTexto).toContain('¿Quiénes jugaron este partido?');

      await tocar(botonDe('Jacob'));
      await tocar('sm:listo');
      expect(adaptador.ultimoTexto).toContain('¿Quién anotó?');
    });

    it('un participante sin ningún evento propio aparece en el resumen con nota base', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido participante sin evento');
      await crearPartido(equipo.id);

      await decir('/cargar');
      await tocar('md:post');

      // Jacob anota; Andrés se marca como participante pero no tiene ningún
      // evento propio -- antes de este paso quedaba afuera del resumen (y
      // de /stats) por completo, como si no hubiera jugado.
      await tocar(botonDe('Jacob'));
      await tocar(botonDe('Andrés'));
      await tocar('sm:listo');

      await tocar(botonDe('Jacob'));
      await tocar('pp:golesListo');
      await tocar('pp:tarjetasListo');
      await decir('1-0');

      const textos = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
      // 1 gol sin posición (3 puntos brutos) → nota 7.5; sin eventos → 6.0.
      expect(textos).toContain('Jacob #10: 7.5');
      expect(textos).toContain('Andrés #7: 6.0');
    });

    it('no pide titular: el modo se ofrece igual sin ninguna elegida', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido sin titular');
      await crearPartido(equipo.id);

      await decir('/cargar');
      expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');
      expect(adaptador.ultimosBotones.map((b) => b.id)).toContain('md:post');
      expect(adaptador.ultimosBotones.map((b) => b.id)).not.toContain('md:vivo');

      await tocar('md:post');
      expect(adaptador.ultimoTexto).toContain('¿Quiénes jugaron este partido?');

      await elegirParticipantesPost(tocar);
      expect(adaptador.ultimoTexto).toContain('¿Quién anotó?');
    });

    it('carga goleadores y tarjetas tocando la plantilla, y el resumen trae el MVP', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido');
      await crearPartido(equipo.id);

      await decir('/cargar');
      expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');

      await tocar('md:post');
      await elegirParticipantesPost(tocar);
      expect(adaptador.ultimoTexto).toContain('¿Quién anotó?');

      // Jacob anota dos, Andrés uno: se toca el botón de cada uno tantas
      // veces como anotó, en vez de escribir "Jacob 2, Andrés 1".
      await tocar(botonDe('Jacob'));
      await tocar(botonDe('Jacob'));
      await tocar(botonDe('Andrés'));
      expect(adaptador.ultimoTexto).toContain('Van: Jacob, Jacob, Andrés.');

      await tocar('pp:golesListo');
      expect(adaptador.ultimoTexto).toContain('¿Hubo tarjetas?');

      await tocar(botonDe('Andrés'));
      expect(adaptador.ultimoTexto).toContain('¿Amarilla o roja para Andrés?');

      await tocar('pp:amarilla');
      expect(adaptador.ultimoTexto).toContain('¿Hubo tarjetas?');
      expect(adaptador.ultimoTexto).toContain('Van: Andrés 🟨.');

      await tocar('pp:tarjetasListo');
      // El derivado de los tres goles es 3-0; el marcador real (3-1) se
      // confirma en el mismo paso de siempre, sin preguntarlo dos veces.
      expect(adaptador.ultimoTexto).toContain('¿Confirmas el marcador final? 3-0');

      await decir('3-1');

      const textos = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
      expect(textos).toContain('Partido cerrado ✅');
      expect(textos).toContain('3 - 1');
      // El detalle evento por evento ya no va en el resumen (se vio en la
      // bitácora del paso a paso de arriba); acá solo hace falta que sigan
      // las notas/MVP.
      // Jacob: 2 goles sin posición (3 c/u) = 6 puntos brutos → nota 9.0.
      // Andrés: 1 gol - 1 amarilla = 2 puntos brutos → nota 7.0.
      expect(textos).toContain('MVP del partido: Jacob (9.0) — 2 goles');

      const partido = (await partidos.recientesDe(equipo.id))[0];
      expect(partido.modoCarga).toBe('post_partido');
      expect(partido.marcadorPropioConfirmado).toBe(3);
      expect(partido.marcadorRivalConfirmado).toBe(1);

      const cargados = await eventos.delPartido(partido.id);
      expect(cargados).toHaveLength(4);
      expect(cargados.every((e) => e.tiempo === null && e.minutoCalculado === null)).toBe(true);
    });

    it('"Otro jugador" da de alta a quien no está en la plantilla', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido otro jugador');
      await crearPartido(equipo.id);

      await decir('/cargar');
      await tocar('md:post');
      await elegirParticipantesPost(tocar);

      await tocar('pp:otro');
      expect(adaptador.ultimoTexto).toContain('Escribe el nombre de quien anotó');

      await decir('Samuel, 4');
      expect(adaptador.ultimoTexto).toContain('¿Quién anotó?');
      expect(adaptador.ultimoTexto).toContain('Van: Samuel.');

      await tocar('pp:golesListo');
      await tocar('pp:otro');
      expect(adaptador.ultimoTexto).toContain('Escribe el nombre de quien vio la tarjeta');

      await decir('Samuel');
      expect(adaptador.ultimoTexto).toContain('¿Amarilla o roja para Samuel?');

      await tocar('pp:roja');
      await tocar('pp:tarjetasListo');
      await decir('1-0');

      const cargados = await eventos.delPartido((await partidos.recientesDe(equipo.id))[0].id);
      expect(cargados).toHaveLength(2);
      expect(cargados.map((e) => e.tipo).sort()).toEqual(['gol', 'tarjeta_roja']);

      const plantilla = await jugadores.listar(equipo.id);
      expect(plantilla.map((j) => j.nombre)).toContain('Samuel');
    });

    it('no da de alta a nadie en "Otro jugador" de tarjetas a quien perdió el rol', async () => {
      const { equipo, usuarioId, decir, tocar } = await escenario(
        'Post partido sin permiso tarjeta',
      );
      await crearPartido(equipo.id);

      await decir('/cargar');
      await tocar('md:post');
      await elegirParticipantesPost(tocar);
      await tocar('pp:golesListo');
      await tocar('pp:otro');
      expect(adaptador.ultimoTexto).toContain('Escribe el nombre de quien vio la tarjeta');

      // El rol se revoca justo antes de escribir el nombre -- mismo chequeo
      // que ya hace el "Otro jugador" de goleadores antes de crear al
      // jugador nuevo.
      await db.db.execute(
        sql`delete from usuarios_equipos where equipo_id = ${equipo.id} and usuario_id = ${usuarioId}`,
      );

      await decir('Samuel, 4');
      expect(adaptador.ultimoTexto).toContain('Ya no tienes permiso');

      const plantilla = await jugadores.listar(equipo.id, true);
      expect(plantilla.map((j) => j.nombre)).not.toContain('Samuel');
    });

    it('"Corregir todo" borra lo cargado y deja empezar de nuevo', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido corregir');
      const partido = await crearPartido(equipo.id);

      await decir('/cargar');
      await tocar('md:post');
      await elegirParticipantesPost(tocar);

      const jacobBoton = botonDe('Jacob');
      await tocar(jacobBoton);
      await tocar(jacobBoton);
      await tocar(jacobBoton);
      await tocar('pp:golesListo');
      await tocar('pp:tarjetasListo');
      expect(adaptador.ultimoTexto).toContain('¿Confirmas el marcador final?');

      // Antes de cerrar, se vuelve a /cargar: RF-4.2 tiene que mostrar el
      // resumen ya cargado en vez de preguntar el modo de nuevo.
      adaptador.limpiar();
      await decir('/cargar');
      expect(adaptador.ultimoTexto).toContain('Jacob');
      expect(adaptador.ultimoTexto).toContain('¿Agregas o corriges algo?');

      await tocar('pp:corregir');
      expect(adaptador.ultimoTexto).toContain('¿Quién anotó?');
      expect(await eventos.delPartido(partido.id)).toHaveLength(0);

      await tocar(botonDe('Andrés'));
      await tocar('pp:golesListo');
      await tocar('pp:tarjetasListo');
      await decir('1-0');

      const cargados = await eventos.delPartido(partido.id);
      expect(cargados).toHaveLength(1);
      expect(cargados[0].jugadorNombre).toBe('Andrés');
    });

    it('"/saltar" no se guarda como el nombre de un jugador', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido saltar');
      const partido = await crearPartido(equipo.id);

      await decir('/cargar');
      await tocar('md:post');
      await elegirParticipantesPost(tocar);
      await tocar('pp:otro');

      // "/saltar" es una palabra de flujo genérica (COMANDOS_DE_FLUJO), no
      // el nombre de nadie: tiene que pedir de nuevo, no crear un jugador
      // "/saltar".
      await decir('/saltar');
      expect(adaptador.ultimoTexto).toContain('Escribe el nombre');

      await decir('Samuel, 4');
      expect(adaptador.ultimoTexto).toContain('¿Quién anotó?');
      expect(adaptador.ultimoTexto).toContain('Van: Samuel.');

      await tocar('pp:golesListo');
      await tocar('pp:tarjetasListo');
      await decir('1-0');

      expect(await eventos.delPartido(partido.id)).toHaveLength(1);

      const plantilla = await jugadores.listar(equipo.id, true);
      expect(plantilla.map((j) => j.nombre)).not.toContain('/saltar');
      expect(plantilla.map((j) => j.nombre)).toContain('Samuel');
    });
  });

  const crearPartido = (equipoId: string) =>
    identidad.resolverUsuario(textoDePrueba('', nuevoCanal())).then((creadoPor) =>
      partidos.crear({
        equipoId,
        rival: 'Deportivo Norte',
        fecha: '2026-09-06',
        formato: { cantidadTiempos: 2, minutosPorTiempo: 25 },
        creadoPor,
      }),
    );
});
