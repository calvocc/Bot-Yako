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
import { MembresiasService } from '../src/identidad/membresias.service';
import { InvitacionesService } from '../src/invitaciones/invitaciones.service';
import { JugadoresService } from '../src/jugadores/jugadores.service';
import { OrganizacionModule } from '../src/organizacion.module';

/**
 * Conversaciones completas contra la base de datos real, sin Telegram.
 *
 * Es la prueba de que los flujos funcionan de punta a punta: el
 * FakeChannelAdapter captura lo que el bot habría enviado, así que se puede
 * afirmar sobre el texto exacto que vería un papá en el chat.
 */
describe('Onboarding y organización (e2e)', () => {
  let app: TestingModule;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;
  let db: DbService;
  let membresias: MembresiasService;

  /** Cada test usa un id de canal distinto para no compartir estado. */
  let siguienteUsuario = 1;
  const nuevoUsuario = () => {
    const id = String(900000 + siguienteUsuario++);
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
    // Limpia solo lo que crearon estos tests; el borrado en cascada se lleva
    // equipos, jugadores e invitaciones.
    await db.db.execute(sql`delete from academias where nombre like 'E2E %'`);
    await app.close();
  });

  beforeEach(() => adaptador.limpiar());

  describe('crear una academia desde cero', () => {
    it('recorre academia → equipo → formato → plantilla', async () => {
      const usuario = nuevoUsuario();
      const decir = (texto: string) => procesador.procesar(textoDePrueba(texto, usuario));
      const tocar = (id: string) => procesador.procesar(seleccionDePrueba(id, usuario));

      await decir('/start');
      expect(adaptador.ultimoTexto).toContain('Soy Yako');
      expect(adaptador.ultimosBotones).toHaveLength(2);

      await tocar('onb:crear');
      expect(adaptador.ultimoTexto).toContain('¿Cómo se llama la academia');

      await decir('E2E Ringo Amaya');
      expect(adaptador.ultimoTexto).toContain('creada');
      expect(adaptador.ultimoTexto).toContain('primer equipo');

      await decir('Sub-11');
      expect(adaptador.ultimoTexto).toContain('Formato');

      await tocar('onb:fmt:0');
      expect(adaptador.ultimoTexto).toContain('plantilla');

      // Varios jugadores de una sola vez: es como llega una plantilla real.
      await decir('Jacob, 10\nAndrés, 7\nMateo 4');
      expect(adaptador.ultimoTexto).toContain('Jacob #10');
      expect(adaptador.ultimoTexto).toContain('Van 3 jugadores');

      await decir('/listo');
      expect(adaptador.ultimoTexto).toContain('Plantilla lista con 3');

      // Y quedó realmente en la base, con el creador como admin.
      const equipos = await membresias.equiposDe(await usuarioIdDe(app, usuario.canalUserId));
      expect(equipos).toHaveLength(1);
      expect(equipos[0].rol).toBe('admin');
      expect(equipos[0].equipoNombre).toBe('Sub-11');

      const plantilla = await app.get(JugadoresService).listar(equipos[0].equipoId);
      expect(plantilla.map((j) => j.nombre).sort()).toEqual(['Andrés', 'Jacob', 'Mateo']);
    });

    it('rechaza un dorsal repetido sin perder el resto del lote', async () => {
      const usuario = nuevoUsuario();
      const decir = (texto: string) => procesador.procesar(textoDePrueba(texto, usuario));
      const tocar = (id: string) => procesador.procesar(seleccionDePrueba(id, usuario));

      await decir('/start');
      await tocar('onb:crear');
      await decir('E2E Dorsales');
      await decir('Sub-13');
      await tocar('onb:fmt:0');

      await decir('Jacob, 10\nOtro, 10\nTercero, 11');

      expect(adaptador.ultimoTexto).toContain('Jacob #10');
      expect(adaptador.ultimoTexto).toContain('Tercero #11');
      expect(adaptador.ultimoTexto).toContain('ya lo tiene Jacob');
      expect(adaptador.ultimoTexto).toContain('Van 2 jugadores');
    });
  });

  describe('invitaciones', () => {
    it('un invitado como Editor queda con ese rol y ve su equipo', async () => {
      const admin = nuevoUsuario();
      const papa = nuevoUsuario();

      await procesador.procesar(textoDePrueba('/start', admin));
      await procesador.procesar(seleccionDePrueba('onb:crear', admin));
      await procesador.procesar(textoDePrueba('E2E Invitaciones', admin));
      await procesador.procesar(textoDePrueba('Sub-9', admin));
      await procesador.procesar(seleccionDePrueba('onb:fmt:0', admin));
      await procesador.procesar(textoDePrueba('/listo', admin));

      // El admin genera el código. Con un solo equipo no se le pregunta cuál.
      await procesador.procesar(textoDePrueba('/invitar', admin));
      expect(adaptador.ultimoTexto).toContain('¿Qué podrá hacer');

      await procesador.procesar(seleccionDePrueba('inv:rol:editor', admin));
      await procesador.procesar(seleccionDePrueba('inv:usos:25', admin));

      const codigo = adaptador.ultimoTexto.match(/YAKO-[A-Z0-9]+/)?.[0];
      expect(codigo).toBeDefined();

      // El papá entra con el código.
      await procesador.procesar(textoDePrueba(`/unirme ${codigo!}`, papa));
      expect(adaptador.ultimoTexto).toContain('Editor');
      expect(adaptador.ultimoTexto).toContain('Sub-9');

      const equiposDelPapa = await membresias.equiposDe(await usuarioIdDe(app, papa.canalUserId));
      expect(equiposDelPapa).toHaveLength(1);
      expect(equiposDelPapa[0].rol).toBe('editor');
    });

    it('el mismo código no cuenta dos veces para la misma persona', async () => {
      const admin = nuevoUsuario();
      const papa = nuevoUsuario();

      const academia = await app.get(AcademiasService).crear('E2E Doble canje');
      const adminId = await usuarioIdDe(app, admin.canalUserId);
      const equipo = await app
        .get(EquiposService)
        .crear(academia.id, 'Sub-15', { cantidadTiempos: 2, minutosPorTiempo: 25 }, adminId);

      const inv = await app
        .get(InvitacionesService)
        .crear(equipo.id, 'viewer', adminId, { usosMaximos: 1 });

      await procesador.procesar(textoDePrueba(`/unirme ${inv.codigo}`, papa));
      expect(adaptador.ultimoTexto).toContain('Viewer');

      await procesador.procesar(textoDePrueba(`/unirme ${inv.codigo}`, papa));
      expect(adaptador.ultimoTexto).toContain('Ya eras');
    });

    it('avisa cuando el código no existe', async () => {
      const usuario = nuevoUsuario();

      await procesador.procesar(textoDePrueba('/unirme YAKO-NOEXISTE', usuario));

      expect(adaptador.ultimoTexto).toContain('no existe');
    });
  });

  describe('permisos', () => {
    it('no deja a un Viewer entrar a /invitar', async () => {
      const admin = nuevoUsuario();
      const viewer = nuevoUsuario();

      const academia = await app.get(AcademiasService).crear('E2E Permisos');
      const adminId = await usuarioIdDe(app, admin.canalUserId);
      const equipo = await app
        .get(EquiposService)
        .crear(academia.id, 'Sub-11', { cantidadTiempos: 2, minutosPorTiempo: 25 }, adminId);

      const viewerId = await usuarioIdDe(app, viewer.canalUserId);
      await membresias.asignarRol(viewerId, equipo.id, 'viewer');

      await procesador.procesar(textoDePrueba('/invitar', viewer));

      expect(adaptador.ultimoTexto).toContain('administrador');
    });
  });

  describe('resolución de equipo (RF-7.2)', () => {
    it('no pregunta cuál equipo si el usuario tiene uno solo', async () => {
      const usuario = nuevoUsuario();

      await procesador.procesar(textoDePrueba('/start', usuario));
      await procesador.procesar(seleccionDePrueba('onb:crear', usuario));
      await procesador.procesar(textoDePrueba('E2E Un equipo', usuario));
      await procesador.procesar(textoDePrueba('Sub-11', usuario));
      await procesador.procesar(seleccionDePrueba('onb:fmt:0', usuario));
      await procesador.procesar(textoDePrueba('/listo', usuario));

      adaptador.limpiar();
      await procesador.procesar(textoDePrueba('/plantilla', usuario));

      // Va directo a la plantilla, sin preguntar nada.
      expect(adaptador.ultimoTexto).toContain('Plantilla de Sub-11');
      expect(adaptador.enviados).toHaveLength(1);
    });

    it('pregunta cuál equipo si el usuario tiene dos', async () => {
      const usuario = nuevoUsuario();

      await procesador.procesar(textoDePrueba('/start', usuario));
      await procesador.procesar(seleccionDePrueba('onb:crear', usuario));
      await procesador.procesar(textoDePrueba('E2E Dos equipos', usuario));
      await procesador.procesar(textoDePrueba('Sub-11', usuario));
      await procesador.procesar(seleccionDePrueba('onb:fmt:0', usuario));
      await procesador.procesar(textoDePrueba('/listo', usuario));

      await procesador.procesar(textoDePrueba('/nuevoequipo', usuario));
      await procesador.procesar(textoDePrueba('Sub-9', usuario));
      await procesador.procesar(seleccionDePrueba('fmt:0', usuario));
      await procesador.procesar(textoDePrueba('/listo', usuario));

      adaptador.limpiar();
      await procesador.procesar(textoDePrueba('/plantilla', usuario));

      expect(adaptador.ultimoTexto).toContain('¿De cuál equipo');
      expect(adaptador.ultimosBotones).toHaveLength(2);
    });
  });
});

/**
 * Id de usuario para un canalUserId, creándolo si hace falta.
 *
 * Usa el mismo servicio que el bot, así que es idempotente: llamarlo para
 * alguien que ya escribió devuelve su id en vez de chocar con la identidad.
 */
async function usuarioIdDe(app: TestingModule, canalUserId: string): Promise<string> {
  return app
    .get(IdentidadService)
    .resolverUsuario(textoDePrueba('', { canalUserId, chatId: canalUserId }));
}
