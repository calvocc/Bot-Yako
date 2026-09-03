import { sql } from 'drizzle-orm';
import { Test, type TestingModule } from '@nestjs/testing';
import { AcademiasService } from '../src/academias/academias.service';
import { textoDePrueba } from '../src/channels/testing/fake.adapter';
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
import { OrganizacionModule } from '../src/organizacion.module';

/**
 * Los invariantes que la revisión encontró rotos. Van contra Postgres real
 * porque son precisamente fallos de transacción y concurrencia: en memoria no
 * se ven.
 */
describe('Atomicidad e invariantes (e2e)', () => {
  let app: TestingModule;
  let db: DbService;
  let membresias: MembresiasService;
  let equipos: EquiposService;
  let identidad: IdentidadService;

  let siguiente = 1;
  const nuevoCanalId = () => String(950000 + siguiente++);

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
    }).compile();

    await app.init();
    db = app.get(DbService);
    membresias = app.get(MembresiasService);
    equipos = app.get(EquiposService);
    identidad = app.get(IdentidadService);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'ATOM %'`);
    await app.close();
  });

  const usuario = async (canalUserId = nuevoCanalId()) =>
    identidad.resolverUsuario(textoDePrueba('', { canalUserId, chatId: canalUserId }));

  /** Cuentas que ninguna identidad puede alcanzar. */
  const contarHuerfanos = async (): Promise<number> => {
    const filas = await db.db.execute<{ n: number }>(
      sql`select count(*)::int as n from usuarios u
          where not exists (select 1 from identidades_usuario i where i.usuario_id = u.id)`,
    );

    return filas[0].n;
  };

  describe('crear equipo', () => {
    it('deja siempre un admin, o no deja equipo', async () => {
      const creador = await usuario();
      const academia = await app.get(AcademiasService).crear('ATOM Con admin');

      const equipo = await equipos.crear(
        academia.id,
        'Sub-11',
        { cantidadTiempos: 2, minutosPorTiempo: 25 },
        creador,
      );

      expect(await membresias.rolEn(creador, equipo.id)).toBe('admin');
    });

    it('no deja el nombre ocupado si la creación falla', async () => {
      const academia = await app.get(AcademiasService).crear('ATOM Rollback');

      // Un creador inexistente rompe la FK de usuarios_equipos, que ahora
      // ocurre dentro de la transacción: antes el equipo quedaba creado, sin
      // admin, y con el nombre tomado para siempre.
      await expect(
        equipos.crear(
          academia.id,
          'Sub-11',
          { cantidadTiempos: 2, minutosPorTiempo: 25 },
          '00000000-0000-0000-0000-000000000000',
        ),
      ).rejects.toThrow();

      expect(await equipos.deAcademia(academia.id)).toHaveLength(0);

      // Y el nombre sigue libre para reintentar.
      const creador = await usuario();
      const reintento = await equipos.crear(
        academia.id,
        'Sub-11',
        { cantidadTiempos: 2, minutosPorTiempo: 25 },
        creador,
      );

      expect(reintento.nombre).toBe('Sub-11');
    });
  });

  describe('identidad', () => {
    it('dos primeros mensajes simultáneos crean una sola cuenta', async () => {
      const canalUserId = nuevoCanalId();
      const mensaje = () =>
        identidad.resolverUsuario(textoDePrueba('hola', { canalUserId, chatId: canalUserId }));

      // Se mide el delta, no el total: la base es compartida y puede traer
      // huérfanos de corridas viejas. Lo que importa es que esta operación no
      // agregue ninguno.
      const antes = await contarHuerfanos();
      const [a, b] = await Promise.all([mensaje(), mensaje()]);
      const despues = await contarHuerfanos();

      expect(a).toBe(b);
      expect(despues).toBe(antes);
    });
  });

  describe('canje de invitación', () => {
    it('da la membresía en la misma operación que consume el uso', async () => {
      const admin = await usuario();
      const papa = await usuario();
      const academia = await app.get(AcademiasService).crear('ATOM Canje');
      const equipo = await equipos.crear(
        academia.id,
        'Sub-11',
        { cantidadTiempos: 2, minutosPorTiempo: 25 },
        admin,
      );

      const inv = await app
        .get(InvitacionesService)
        .crear(equipo.id, 'editor', admin, { usosMaximos: 1 });

      const resultado = await app.get(InvitacionesService).canjear(inv.codigo, papa);

      expect(resultado.estado).toBe('ok');
      // El uso quedó consumido Y el rol asignado: nunca uno sin el otro.
      expect(await membresias.rolEn(papa, equipo.id)).toBe('editor');
    });

    it('no degrada a un Editor que canjea un código de Viewer', async () => {
      const admin = await usuario();
      const editor = await usuario();
      const academia = await app.get(AcademiasService).crear('ATOM Sin degradar');
      const equipo = await equipos.crear(
        academia.id,
        'Sub-11',
        { cantidadTiempos: 2, minutosPorTiempo: 25 },
        admin,
      );

      await membresias.asignarRol(editor, equipo.id, 'editor');

      const codigoViewer = await app
        .get(InvitacionesService)
        .crear(equipo.id, 'viewer', admin, { usosMaximos: 10 });

      const resultado = await app.get(InvitacionesService).canjear(codigoViewer.codigo, editor);

      expect(resultado).toMatchObject({ estado: 'ok', rol: 'editor' });
      expect(await membresias.rolEn(editor, equipo.id)).toBe('editor');
    });

    it('un código de un solo uso no lo canjean dos personas', async () => {
      const admin = await usuario();
      const uno = await usuario();
      const dos = await usuario();
      const academia = await app.get(AcademiasService).crear('ATOM Carrera');
      const equipo = await equipos.crear(
        academia.id,
        'Sub-11',
        { cantidadTiempos: 2, minutosPorTiempo: 25 },
        admin,
      );

      const inv = await app
        .get(InvitacionesService)
        .crear(equipo.id, 'viewer', admin, { usosMaximos: 1 });

      const servicio = app.get(InvitacionesService);
      const [a, b] = await Promise.all([
        servicio.canjear(inv.codigo, uno),
        servicio.canjear(inv.codigo, dos),
      ]);

      const estados = [a.estado, b.estado].sort();
      expect(estados).toEqual(['agotada', 'ok']);
    });
  });
});
