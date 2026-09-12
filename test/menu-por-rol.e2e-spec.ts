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
import { EstadisticasModule } from '../src/estadisticas.module';
import { IdentidadModule } from '../src/identidad/identidad.module';
import { IdentidadService } from '../src/identidad/identidad.service';
import { MembresiasService } from '../src/identidad/membresias.service';
import { OrganizacionModule } from '../src/organizacion.module';
import { PartidosModule } from '../src/partidos.module';

/**
 * `/ayuda` (y el menú nativo de Telegram, via `ChannelAdapter.actualizarMenu`)
 * tienen que mostrar solo lo que el usuario que pregunta puede hacer, no el
 * catálogo entero -- ver `comandosParaUsuario`. Se ejercitan juntos
 * `PartidosModule` y `EstadisticasModule` para tener, a la vez, un comando de
 * cada rol mínimo (`/nuevopartido` Editor, `/permisos` Admin, `/stats`
 * Viewer, `/ayuda` cualquiera).
 */
describe('Menú según el rol (e2e)', () => {
  let app: TestingModule;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;
  let db: DbService;
  let membresias: MembresiasService;

  let siguiente = 1;
  const nuevoUsuario = () => {
    const id = String(940000 + siguiente++);
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
        EstadisticasModule,
      ],
      providers: [ChannelRegistry, ProcesadorMensajes],
    }).compile();

    await app.init();

    adaptador = new FakeChannelAdapter('telegram');
    app.get(ChannelRegistry).registrar(adaptador);
    procesador = app.get(ProcesadorMensajes);
    db = app.get(DbService);
    membresias = app.get(MembresiasService);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'MENU %'`);
    await app.close();
  });

  beforeEach(() => adaptador.limpiar());

  const usuarioIdDe = (canalUserId: string): Promise<string> =>
    app
      .get(IdentidadService)
      .resolverUsuario(textoDePrueba('', { canalUserId, chatId: canalUserId }));

  it('sin ningún equipo, /ayuda solo ofrece lo que es de "cualquiera"', async () => {
    const usuario = nuevoUsuario();
    await procesador.procesar(textoDePrueba('/start', usuario)); // resuelve la cuenta

    adaptador.limpiar();
    await procesador.procesar(textoDePrueba('/ayuda', usuario));

    expect(adaptador.ultimoTexto).toContain('/ayuda');
    expect(adaptador.ultimoTexto).toContain('/unirme');
    expect(adaptador.ultimoTexto).not.toContain('/nuevopartido');
    expect(adaptador.ultimoTexto).not.toContain('/permisos');
    expect(adaptador.ultimoTexto).not.toContain('/stats');
  });

  it('un Viewer ve las consultas pero no lo de Editor ni Admin', async () => {
    const admin = nuevoUsuario();
    const viewer = nuevoUsuario();

    const academia = await app.get(AcademiasService).crear('MENU Viewer');
    const adminId = await usuarioIdDe(admin.canalUserId);
    const equipo = await app
      .get(EquiposService)
      .crear(academia.id, 'Sub-11', { cantidadTiempos: 2, minutosPorTiempo: 25 }, adminId);

    const viewerId = await usuarioIdDe(viewer.canalUserId);
    await membresias.asignarRol(viewerId, equipo.id, 'viewer');

    await procesador.procesar(textoDePrueba('/ayuda', viewer));

    expect(adaptador.ultimoTexto).toContain('/stats');
    expect(adaptador.ultimoTexto).toContain('/tabla');
    expect(adaptador.ultimoTexto).not.toContain('/nuevopartido');
    expect(adaptador.ultimoTexto).not.toContain('/permisos');
  });

  it('el admin de ese mismo equipo sí ve /nuevopartido y /permisos', async () => {
    const admin = nuevoUsuario();

    const academia = await app.get(AcademiasService).crear('MENU Admin');
    const adminId = await usuarioIdDe(admin.canalUserId);
    await app
      .get(EquiposService)
      .crear(academia.id, 'Sub-11', { cantidadTiempos: 2, minutosPorTiempo: 25 }, adminId);

    await procesador.procesar(textoDePrueba('/ayuda', admin));

    expect(adaptador.ultimoTexto).toContain('/nuevopartido');
    expect(adaptador.ultimoTexto).toContain('/permisos');
    expect(adaptador.ultimoTexto).toContain('/stats');
  });

  it('crear una academia refresca el menú nativo del chat, con lo que ya puede hacer', async () => {
    const usuario = nuevoUsuario();
    const decir = (texto: string) => procesador.procesar(textoDePrueba(texto, usuario));
    const tocar = (id: string) => procesador.procesar(seleccionDePrueba(id, usuario));

    await decir('/start');
    await tocar('onb:crear');
    await decir('MENU Recién creada');
    await decir('Sub-11');
    await tocar('onb:fmt:0');

    expect(adaptador.menusActualizados).toHaveLength(0); // todavía no terminó

    await decir('/listo'); // cierra la carga de plantilla -> onboarding termina acá

    expect(adaptador.menusActualizados).toHaveLength(1);
    const nombres = adaptador.menusActualizados[0].comandos.map((c) => c.nombre);
    expect(nombres).toContain('nuevopartido');
    expect(nombres).toContain('permisos');
    expect(adaptador.menusActualizados[0].destino.chatId).toBe(usuario.chatId);
  });

  it('unirse con un código también refresca el menú; un comando de consulta no', async () => {
    const admin = nuevoUsuario();
    const papa = nuevoUsuario();

    const academia = await app.get(AcademiasService).crear('MENU Unirme');
    const adminId = await usuarioIdDe(admin.canalUserId);
    await app
      .get(EquiposService)
      .crear(academia.id, 'Sub-9', { cantidadTiempos: 2, minutosPorTiempo: 25 }, adminId);

    await procesador.procesar(textoDePrueba('/invitar', admin));
    await procesador.procesar(seleccionDePrueba('inv:rol:editor', admin));
    await procesador.procesar(seleccionDePrueba('inv:usos:25', admin));
    const codigo = adaptador.ultimoTexto.match(/YAKO-[A-Z0-9]+/)?.[0];
    expect(codigo).toBeDefined();

    // Un comando de consulta "normal" (no /ayuda) no dispara el refresco.
    await procesador.procesar(textoDePrueba('/mishijos', papa));
    expect(adaptador.menusActualizados).toHaveLength(0);

    await procesador.procesar(textoDePrueba(`/unirme ${codigo!}`, papa));

    expect(adaptador.menusActualizados).toHaveLength(1);
    const nombres = adaptador.menusActualizados[0].comandos.map((c) => c.nombre);
    expect(nombres).toContain('nuevopartido'); // ya es Editor de Sub-9
    expect(nombres).not.toContain('permisos'); // pero no Admin
  });

  it('/ayuda también refresca el menú nativo -- la salida de alguien a quien /permisos le cambió el rol', async () => {
    const admin = nuevoUsuario();
    const editor = nuevoUsuario();

    const academia = await app.get(AcademiasService).crear('MENU Ayuda refresca');
    const adminId = await usuarioIdDe(admin.canalUserId);
    const equipo = await app
      .get(EquiposService)
      .crear(academia.id, 'Sub-11', { cantidadTiempos: 2, minutosPorTiempo: 25 }, adminId);

    const editorId = await usuarioIdDe(editor.canalUserId);
    await membresias.asignarRol(editorId, equipo.id, 'editor');

    await procesador.procesar(textoDePrueba('/ayuda', editor));

    expect(adaptador.menusActualizados).toHaveLength(1);
    let nombres = adaptador.menusActualizados[0].comandos.map((c) => c.nombre);
    expect(nombres).toContain('nuevopartido');
    expect(nombres).not.toContain('permisos');

    // El admin lo degrada a Viewer (otro chat: /permisos no puede empujarle
    // el refresco a él). Corriendo /ayuda de nuevo, sí se sincroniza solo.
    await membresias.asignarRol(editorId, equipo.id, 'viewer');
    adaptador.limpiar();

    await procesador.procesar(textoDePrueba('/ayuda', editor));

    expect(adaptador.menusActualizados).toHaveLength(1);
    nombres = adaptador.menusActualizados[0].comandos.map((c) => c.nombre);
    expect(nombres).not.toContain('nuevopartido');
    expect(nombres).toContain('stats');
  });
});
