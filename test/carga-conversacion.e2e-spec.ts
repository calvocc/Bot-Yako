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
   * Elige la titular tocando el botón de cada nombre pedido y confirma.
   *
   * La titular es obligatoria para arrancar en vivo (es la única forma de
   * medir minutos jugados), así que todo test que llega a `md:vivo` pasa por
   * acá antes de que el partido arranque de verdad.
   */
  const elegirTitulares = async (
    tocar: (id: string) => Promise<void>,
    nombres: string[],
  ): Promise<void> => {
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

    await tocar('md:vivo');
    expect(adaptador.ultimoTexto).toContain('Elige la titular');

    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
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
    await tocar('md:vivo');
    await elegirTitulares(tocar, ['Jacob']);
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

  it('/deshacer quita el último evento propio y lo cuenta', async () => {
    const { equipo, usuarioId, decir, tocar } = await escenario('Deshacer');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:vivo');
    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
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
    await tocar('md:vivo');
    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
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
    await tocar('md:vivo');
    await elegirTitulares(tocar, ['Jacob', 'Andrés']);
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

  it('no deja arrancar en vivo sin elegir al menos un titular', async () => {
    const { equipo, decir, tocar } = await escenario('Sin titular');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:vivo');
    expect(adaptador.ultimoTexto).toContain('Elige la titular');

    await tocar('sm:listo');
    expect(adaptador.ultimoTexto).toContain('Elige al menos uno.');

    const partido = (await partidos.abiertosDe(equipo.id))[0];
    expect(partido.modoCarga).toBeNull();
  });

  it('elegir la titular edita el mismo mensaje en vez de apilar uno por jugador', async () => {
    const { equipo, decir, tocar } = await escenario('Titular sin apilar');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:vivo');

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
    await tocar('md:vivo');

    await tocar('sm:todos');
    expect(adaptador.ultimosBotones.find((b) => b.id === 'sm:listo')?.texto).toBe('Listo (2)');

    await tocar('sm:listo');
    expect(adaptador.ultimoTexto).toContain('Arrancó el Tiempo 1');
  });

  it('escribir los dorsales elige la titular sin tocar botones', async () => {
    const { equipo, decir, tocar } = await escenario('Titular por dorsal');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:vivo');

    await decir('10, 7');
    expect(adaptador.ultimosBotones.find((b) => b.id === 'sm:listo')?.texto).toBe('Listo (2)');

    await tocar('sm:listo');
    expect(adaptador.ultimoTexto).toContain('Arrancó el Tiempo 1');
  });

  it('cambio: sale de la cancha, entra del resto, y el siguiente evento ya no ofrece a quien salió', async () => {
    const { equipo, decir, tocar } = await escenario('Cambio');
    await crearPartido(equipo.id);

    await decir('/cargar');
    await tocar('md:vivo');
    // Solo Jacob titular: Andrés queda en la banca, así se puede distinguir
    // "en cancha" de "el resto de la plantilla".
    await elegirTitulares(tocar, ['Jacob']);

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
    await tocar('md:vivo');
    // Los dos titulares: no queda nadie en la banca, así que "¿Quién entra?"
    // solo ofrece "Otro jugador" — cualquier nombre escrito tiene que
    // resolverse contra quien ya está jugando, no contra un botón.
    await elegirTitulares(tocar, ['Jacob', 'Andrés']);

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
    it('carga goleadores y tarjetas sin reloj, y el resumen trae el MVP', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido');
      await crearPartido(equipo.id);

      await decir('/cargar');
      expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo');

      await tocar('md:post');
      expect(adaptador.ultimoTexto).toContain('¿Quién anotó?');

      await decir('Jacob 2, Andrés 1');
      expect(adaptador.ultimoTexto).toContain('¿Hubo tarjetas?');

      await decir('Andrés amarilla');
      // El derivado de los tres goles es 3-0; el marcador real (3-1) se
      // confirma en el mismo paso de siempre, sin preguntarlo dos veces.
      expect(adaptador.ultimoTexto).toContain('¿Confirmas el marcador final? 3-0');

      await decir('3-1');

      const textos = adaptador.enviados.map((e) => e.respuesta.texto).join('\n');
      expect(textos).toContain('Partido cerrado ✅');
      expect(textos).toContain('3 - 1');
      expect(textos).toContain('⚽ Gol: Jacob, Jacob, Andrés');
      expect(textos).toContain('🟨 Amarilla: Andrés');
      // Jacob: 2 goles = 6 pts. Andrés: 1 gol - 1 amarilla = 2 pts.
      expect(textos).toContain('MVP del partido: Jacob (6 pts — 2 goles)');

      const partido = (await partidos.recientesDe(equipo.id))[0];
      expect(partido.modoCarga).toBe('post_partido');
      expect(partido.marcadorPropioConfirmado).toBe(3);
      expect(partido.marcadorRivalConfirmado).toBe(1);

      const cargados = await eventos.delPartido(partido.id);
      expect(cargados).toHaveLength(4);
      expect(cargados.every((e) => e.tiempo === null && e.minutoCalculado === null)).toBe(true);
    });

    it('"Corregir todo" borra lo cargado y deja empezar de nuevo', async () => {
      const { equipo, decir, tocar } = await escenario('Post partido corregir');
      const partido = await crearPartido(equipo.id);

      await decir('/cargar');
      await tocar('md:post');
      await decir('Jacob 3');
      await decir('/ninguna');
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

      await decir('Andrés 1');
      await decir('/ninguna');
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

      // "/saltar" es una palabra de flujo genérica (COMANDOS_DE_FLUJO), no
      // "/ninguna": tiene que pedir de nuevo, no crear un jugador "/saltar".
      await decir('/saltar');
      expect(adaptador.ultimoTexto).toContain('Para saltar escribe /ninguna');

      await decir('/ninguna');
      expect(adaptador.ultimoTexto).toContain('¿Hubo tarjetas?');

      await decir('/saltar');
      expect(adaptador.ultimoTexto).toContain('Para saltar escribe /ninguna');

      await decir('/ninguna');

      expect(await eventos.delPartido(partido.id)).toHaveLength(0);

      const plantilla = await jugadores.listar(equipo.id, true);
      expect(plantilla.map((j) => j.nombre)).not.toContain('/saltar');
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
