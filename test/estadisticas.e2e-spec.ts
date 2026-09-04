import { sql } from 'drizzle-orm';
import { Test, type TestingModule } from '@nestjs/testing';
import { AcademiasService } from '../src/academias/academias.service';
import { ChannelRegistry } from '../src/channels/channel.registry';
import { ProcesadorMensajes } from '../src/channels/procesador-mensajes.service';
import { FakeChannelAdapter, textoDePrueba } from '../src/channels/testing/fake.adapter';
import { ConfigModule } from '../src/config/config.module';
import { ConversacionModule } from '../src/conversacion/conversacion.module';
import { RedisModule } from '../src/core/redis/redis.module';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { EquiposService } from '../src/equipos/equipos.service';
import { EstadisticasModule } from '../src/estadisticas.module';
import { EstadisticasHandler } from '../src/estadisticas/estadisticas.handler';
import { EstadisticasService } from '../src/estadisticas/estadisticas.service';
import { EventosService } from '../src/eventos/eventos.service';
import { IdentidadModule } from '../src/identidad/identidad.module';
import { IdentidadService } from '../src/identidad/identidad.service';
import { MembresiasService } from '../src/identidad/membresias.service';
import { JugadoresService } from '../src/jugadores/jugadores.service';
import { OrganizacionModule } from '../src/organizacion.module';
import { PartidosModule } from '../src/partidos.module';
import { PartidosService } from '../src/partidos/partidos.service';
import { TiemposService } from '../src/partidos/tiempos.service';

/**
 * `/stats` y `/tabla` (RF-6) contra las vistas reales de Postgres
 * (`estadisticas_jugador`, `estadisticas_equipo`): lo que se prueba acá es
 * justamente el SQL, que no se puede fingir en memoria.
 */
describe('Estadísticas (e2e)', () => {
  let app: TestingModule;
  let db: DbService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let jugadores: JugadoresService;
  let identidad: IdentidadService;
  let membresias: MembresiasService;
  let partidos: PartidosService;
  let tiempos: TiemposService;
  let eventos: EventosService;
  let estadisticas: EstadisticasService;
  let handler: EstadisticasHandler;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;

  let siguiente = 1;
  const nuevoCanalId = () => String(960000 + siguiente++);

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
        EstadisticasModule,
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
    membresias = app.get(MembresiasService);
    partidos = app.get(PartidosService);
    tiempos = app.get(TiemposService);
    eventos = app.get(EventosService);
    estadisticas = app.get(EstadisticasService);
    handler = app.get(EstadisticasHandler);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'STATS %'`);
    await app.close();
  });

  beforeEach(() => adaptador.limpiar());

  const usuario = async (): Promise<string> => {
    const canalUserId = nuevoCanalId();

    return identidad.resolverUsuario(textoDePrueba('', { canalUserId, chatId: canalUserId }));
  };

  /** Un canal nuevo, listo para mandarle mensajes a `procesador.procesar`. */
  const nuevoCanal = () => {
    const id = nuevoCanalId();

    return { canalUserId: id, chatId: id };
  };

  const escenario = async (nombre: string) => {
    const admin = await usuario();
    const academia = await academias.crear(`STATS ${nombre}`);
    const equipo = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin,
    );

    return { admin, academia, equipo };
  };

  /** Un partido cerrado con `fecha` (para la temporada) y N goles del jugador dado. */
  const partidoConGoles = async (
    equipoId: string,
    admin: string,
    fecha: string,
    jugadorId: string,
    cantidad: number,
    confirmado?: { propio: number; rival: number },
  ) => {
    const partido = await partidos.crear({
      equipoId,
      rival: 'Rival',
      fecha,
      formato: { cantidadTiempos: 2, minutosPorTiempo: 25 },
      creadoPor: admin,
    });

    await tiempos.iniciarEnVivo(partido.id, admin, [jugadorId]);

    for (let i = 0; i < cantidad; i++) {
      // `forzar` salta el chequeo de duplicados (B3): son varios goles
      // legítimos del mismo jugador, no una carga repetida por error.
      await eventos.registrar({
        partidoId: partido.id,
        tipo: 'gol',
        equipoOrigen: 'propio',
        jugadorId,
        reportadoPor: admin,
        forzar: true,
      });
    }

    const marcador = confirmado ?? { propio: cantidad, rival: 0 };

    await partidos.cerrar(partido.id, admin, marcador);

    return partido;
  };

  describe('EstadisticasService', () => {
    it('solo trae la temporada actual, no partidos de años anteriores', async () => {
      const { equipo, admin } = await escenario('Temporada');
      const jacob = await jugadores.crear(equipo.id, 'Jacob', 10);

      await partidoConGoles(equipo.id, admin, '2019-03-01', jacob.id, 5);
      await partidoConGoles(equipo.id, admin, '2026-03-01', jacob.id, 2);

      const stats = await estadisticas.deJugador(equipo.id, 'Jacob', 2026);

      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({ nombre: 'Jacob', temporada: 2026, goles: 2 });
    });

    it('busca por un pedazo del nombre, sin distinguir mayúsculas', async () => {
      const { equipo, admin } = await escenario('Nombre parcial');
      const jacob = await jugadores.crear(equipo.id, 'Jacob Restrepo', 10);

      await partidoConGoles(equipo.id, admin, '2026-04-01', jacob.id, 1);

      const stats = await estadisticas.deJugador(equipo.id, 'jacob', 2026);

      expect(stats).toHaveLength(1);
      expect(stats[0].nombre).toBe('Jacob Restrepo');
    });

    it('la tabla usa el marcador confirmado, no el derivado (C5)', async () => {
      const { equipo, admin } = await escenario('Tabla confirmado');
      const jacob = await jugadores.crear(equipo.id, 'Jacob', 10);

      // Solo se cargó un gol, pero quien cerró declaró que fueron 3.
      await partidoConGoles(equipo.id, admin, '2026-05-01', jacob.id, 1, {
        propio: 3,
        rival: 1,
      });

      const tabla = await estadisticas.deEquipo(equipo.id, 2026);

      expect(tabla).toMatchObject({
        partidosJugados: 1,
        ganados: 1,
        golesFavor: 3,
        golesContra: 1,
      });
    });

    it('sin partidos cerrados en la temporada, no hay tabla', async () => {
      const { equipo } = await escenario('Tabla vacía');

      expect(await estadisticas.deEquipo(equipo.id, 2026)).toBeNull();
    });

    it('el goleador empata por menor dorsal', async () => {
      const { equipo, admin } = await escenario('Goleador empate');
      const jacob = await jugadores.crear(equipo.id, 'Jacob', 10);
      const andres = await jugadores.crear(equipo.id, 'Andrés', 7);

      await partidoConGoles(equipo.id, admin, '2026-06-01', jacob.id, 2);
      await partidoConGoles(equipo.id, admin, '2026-06-08', andres.id, 2);

      const goleador = await estadisticas.goleadorDe(equipo.id, 2026);

      expect(goleador).toMatchObject({ nombre: 'Andrés', dorsal: 7, goles: 2 });
    });
  });

  describe('EstadisticasHandler', () => {
    it('/stats sin nombre pide que se lo escriban', async () => {
      const { admin } = await escenario('Sin nombre');

      const respuesta = await handler.stats(undefined, admin);

      expect(respuesta.texto).toContain('¿De qué jugador?');
    });

    it('/stats de alguien sin estadísticas lo dice', async () => {
      const { admin } = await escenario('Sin stats');

      const respuesta = await handler.stats('Nadie', admin);

      expect(respuesta.texto).toContain('No encontré a nadie llamado "Nadie"');
    });

    it('/tabla trae un bloque por equipo, con el goleador', async () => {
      const { equipo, admin } = await escenario('Tabla handler');
      const jacob = await jugadores.crear(equipo.id, 'Jacob', 10);

      await partidoConGoles(equipo.id, admin, '2026-07-01', jacob.id, 4);

      const respuesta = await handler.tabla(admin);

      expect(respuesta.texto).toContain('1 partidos');
      expect(respuesta.texto).toContain('1 ganados');
      expect(respuesta.texto).toContain('Goleador: Jacob (4)');
    });
  });

  /**
   * Criterios de aceptación #4 y #6: un Viewer consulta estadísticas sin
   * permiso de carga, probado como conversación completa (a través del
   * router, no llamando el handler directo) sin depender de la API de
   * Telegram.
   */
  describe('conversación completa (criterios de aceptación #4 y #6)', () => {
    it('un Viewer sin permiso de carga consulta /stats y /tabla', async () => {
      const { equipo, admin } = await escenario('Viewer conversación');
      const jacob = await jugadores.crear(equipo.id, 'Jacob', 10);

      await partidoConGoles(equipo.id, admin, '2026-08-01', jacob.id, 3);

      const canalViewer = nuevoCanal();
      const viewerId = await identidad.resolverUsuario(textoDePrueba('', canalViewer));

      await membresias.asignarRol(viewerId, equipo.id, 'viewer');
      expect(await membresias.puede(viewerId, equipo.id, 'editor')).toBe(false);

      await procesador.procesar(textoDePrueba('/stats Jacob', canalViewer));
      expect(adaptador.ultimoTexto).toContain('📊 Jacob #10');
      expect(adaptador.ultimoTexto).toContain('Goles: 3');

      adaptador.limpiar();
      await procesador.procesar(textoDePrueba('/tabla', canalViewer));
      expect(adaptador.ultimoTexto).toContain('📋 Sub-11');
      expect(adaptador.ultimoTexto).toContain('Goleador: Jacob (3)');

      // Ni /stats ni /tabla escribieron nada: un Viewer no tiene permiso de
      // carga y estas consultas no deberían necesitarlo tampoco.
      expect(await eventos.delPartido((await partidos.recientesDe(equipo.id))[0].id)).toHaveLength(
        3,
      );
    });

    it('un usuario sin ningún equipo lo dice, sin romper la conversación', async () => {
      const canal = nuevoCanal();
      await identidad.resolverUsuario(textoDePrueba('', canal));

      await procesador.procesar(textoDePrueba('/stats Jacob', canal));
      expect(adaptador.ultimoTexto).toContain('Todavía no perteneces a ningún equipo');

      adaptador.limpiar();
      await procesador.procesar(textoDePrueba('/tabla', canal));
      expect(adaptador.ultimoTexto).toContain('Todavía no perteneces a ningún equipo');
    });
  });
});
