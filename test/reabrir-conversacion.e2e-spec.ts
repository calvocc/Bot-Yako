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
import { IdentidadModule } from '../src/identidad/identidad.module';
import { IdentidadService } from '../src/identidad/identidad.service';
import { JugadoresService } from '../src/jugadores/jugadores.service';
import { OrganizacionModule } from '../src/organizacion.module';
import { PartidosModule } from '../src/partidos.module';
import { PartidosService } from '../src/partidos/partidos.service';

/**
 * `/reabrir` como conversación completa: además del propio flujo (elegir
 * equipo, elegir el partido cerrado, reabrirlo), esto cubre que la respuesta
 * final ofrezca botones para seguir de una en /cargar o /finalizar, en vez
 * de obligar a escribir el comando a mano.
 */
describe('Reabrir, conversación completa (e2e)', () => {
  let app: TestingModule;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;
  let db: DbService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let jugadores: JugadoresService;
  let identidad: IdentidadService;
  let partidos: PartidosService;

  let siguiente = 1;
  const nuevoCanal = () => {
    const id = String(985000 + siguiente++);
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
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'REAB %'`);
    await app.close();
  });

  beforeEach(() => adaptador.limpiar());

  /** Academia + equipo + plantilla, con el usuario ya como admin (rol que exige /reabrir). */
  const escenario = async (nombre: string) => {
    const canal = nuevoCanal();
    const usuarioId = await identidad.resolverUsuario(textoDePrueba('', canal));
    const academia = await academias.crear(`REAB ${nombre}`);
    const equipo = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      usuarioId,
    );

    await jugadores.crear(equipo.id, 'Jacob', 10);

    const decir = (texto: string) => procesador.procesar(textoDePrueba(texto, canal));
    const tocar = (id: string) => procesador.procesar(seleccionDePrueba(id, canal));

    return { canal, usuarioId, equipo, decir, tocar };
  };

  /** Crea un partido y lo cierra de una, sin pasar por /cargar. */
  const partidoCerrado = async (equipoId: string, creadoPor: string) => {
    const partido = await partidos.crear({
      equipoId,
      rival: 'Rival',
      fecha: '2026-01-10',
      formato: { cantidadTiempos: 2, minutosPorTiempo: 25 },
      creadoPor,
    });

    await partidos.cerrar(partido.id, creadoPor, { propio: 2, rival: 1 });

    return partido;
  };

  it('al reabrir, ofrece botones para editar o finalizar en vez de solo texto', async () => {
    const { equipo, usuarioId, decir, tocar } = await escenario('Botones');
    await partidoCerrado(equipo.id, usuarioId);

    await decir('/reabrir');
    expect(adaptador.ultimoTexto).toContain('¿Cuál quieres reabrir?');

    await tocar(adaptador.ultimosBotones[0].id);

    expect(adaptador.ultimoTexto).toContain('Partido reabierto ✅');
    expect(adaptador.ultimosBotones).toEqual([
      { id: 'cmd:cargar', texto: 'Editar partido' },
      { id: 'cmd:finalizar', texto: 'Finalizar' },
    ]);
  });

  it('el botón "Editar partido" dispara /cargar sin tener que escribirlo', async () => {
    const { equipo, usuarioId, decir, tocar } = await escenario('Boton editar');
    await partidoCerrado(equipo.id, usuarioId);

    await decir('/reabrir');
    await tocar(adaptador.ultimosBotones[0].id);

    await tocar('cmd:cargar');

    expect(adaptador.ultimoTexto).toContain('¿Vas a cargar en vivo o ya terminó el partido?');
  });

  it('el botón "Finalizar" dispara /finalizar sin tener que escribirlo', async () => {
    const { equipo, usuarioId, decir, tocar } = await escenario('Boton finalizar');
    await partidoCerrado(equipo.id, usuarioId);

    await decir('/reabrir');
    await tocar(adaptador.ultimosBotones[0].id);

    await tocar('cmd:finalizar');

    expect(adaptador.ultimoTexto).toContain('¿Confirmas el marcador final?');
  });
});
