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
import { JugadoresService } from '../src/jugadores/jugadores.service';
import { OrganizacionModule } from '../src/organizacion.module';
import { PartidosModule } from '../src/partidos.module';

/**
 * Jugadores únicos entre equipos de la misma academia: `personaId` ya
 * existía en el esquema, sin usar en ningún lado. Estos tests son los
 * primeros que lo ejercitan de verdad.
 *
 * Va contra Postgres real porque lo que se prueba incluye una transacción
 * (`vincularNuevoEquipo`) y un índice único de dorsal por equipo.
 */
describe('Jugadores únicos entre equipos (e2e)', () => {
  let app: TestingModule;
  let db: DbService;
  let jugadores: JugadoresService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let identidad: IdentidadService;

  let siguiente = 1;
  const nuevoCanalId = () => String(991000 + siguiente++);

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
    }).compile();

    await app.init();

    db = app.get(DbService);
    jugadores = app.get(JugadoresService);
    academias = app.get(AcademiasService);
    equipos = app.get(EquiposService);
    identidad = app.get(IdentidadService);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'JUG %'`);
    await app.close();
  });

  const usuario = async (): Promise<string> => {
    const canalUserId = nuevoCanalId();

    return identidad.resolverUsuario(textoDePrueba('', { canalUserId, chatId: canalUserId }));
  };

  const escenario = async (nombre: string) => {
    const admin = await usuario();
    const academia = await academias.crear(`JUG ${nombre}`);
    const sub9 = await equipos.crear(
      academia.id,
      'Sub-9',
      { cantidadTiempos: 2, minutosPorTiempo: 20 },
      admin,
    );
    const sub11 = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin,
    );

    return { admin, academia, sub9, sub11 };
  };

  it('buscarEnAcademia encuentra al jugador en otro equipo, no en el mismo', async () => {
    const { academia, sub9, sub11 } = await escenario('Buscar');
    const jacob = await jugadores.crear(sub9.id, 'Jacob Restrepo', 10);
    await jugadores.crear(sub9.id, 'Otro', 5);

    const candidatos = await jugadores.buscarEnAcademia(academia.id, 'jacob restrepo', sub11.id);

    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]).toMatchObject({
      jugadorId: jacob.id,
      equipoId: sub9.id,
      equipoNombre: 'Sub-9',
    });

    // Buscando desde el equipo donde ya está, no se ofrece a sí mismo.
    expect(await jugadores.buscarEnAcademia(academia.id, 'jacob restrepo', sub9.id)).toHaveLength(
      0,
    );
  });

  it('buscarEnAcademia no encuentra a alguien dado de baja', async () => {
    const { academia, sub9, sub11 } = await escenario('Baja');
    const jacob = await jugadores.crear(sub9.id, 'Jacob Restrepo', 10);
    await jugadores.desactivar(sub9.id, jacob.id);

    expect(await jugadores.buscarEnAcademia(academia.id, 'jacob restrepo', sub11.id)).toHaveLength(
      0,
    );
  });

  it('vincularNuevoEquipo crea la ficha nueva con el mismo personaId, y lo backfillea en la vieja', async () => {
    const { sub9, sub11 } = await escenario('Vincular');
    const jacob = await jugadores.crear(sub9.id, 'Jacob Restrepo', 10);

    const enSub11 = await jugadores.vincularNuevoEquipo(
      sub11.id,
      { nombre: 'Jacob Restrepo', dorsal: 7 },
      jacob.id,
    );

    expect(enSub11.dorsal).toBe(7);

    const filas = await db.db.execute(
      sql`select persona_id from jugadores where id in (${jacob.id}, ${enSub11.id})`,
    );
    const personaIds = filas.map((f) => f.persona_id);

    expect(personaIds[0]).not.toBeNull();
    expect(personaIds[0]).toBe(personaIds[1]);
  });

  it('vincularNuevoEquipo reusa el personaId si la ficha de origen ya tenía uno', async () => {
    const { admin, academia, sub9, sub11 } = await escenario('Vincular existente');
    const jacob = await jugadores.crear(sub9.id, 'Jacob Restrepo', 10);

    const primeraLiga = await jugadores.vincularNuevoEquipo(
      sub11.id,
      { nombre: 'Jacob Restrepo' },
      jacob.id,
    );

    // Un tercer equipo, vinculando contra la ficha de Sub-11 (que ya heredó
    // el personaId en el paso anterior) tiene que terminar con el mismo.
    const sub13 = await equipos.crear(
      academia.id,
      'Sub-13',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin,
    );
    const enSub13 = await jugadores.vincularNuevoEquipo(
      sub13.id,
      { nombre: 'Jacob Restrepo' },
      primeraLiga.id,
    );

    const filas = await db.db.execute(
      sql`select persona_id from jugadores where id in (${jacob.id}, ${primeraLiga.id}, ${enSub13.id})`,
    );

    expect(new Set(filas.map((f) => f.persona_id)).size).toBe(1);
  });

  it('vincularNuevoEquipo respeta el dorsal libre del equipo destino, no el de origen', async () => {
    const { sub9, sub11 } = await escenario('Dorsal');
    const jacob = await jugadores.crear(sub9.id, 'Jacob Restrepo', 10);
    // Sub-11 ya tiene el 10 ocupado por otro chico.
    await jugadores.crear(sub11.id, 'Andrés', 10);

    const enSub11 = await jugadores.vincularNuevoEquipo(
      sub11.id,
      { nombre: 'Jacob Restrepo', dorsal: 10 },
      jacob.id,
    );

    // El dorsal pedido choca en el equipo destino: se crea sin dorsal, no
    // falla el vínculo entero por un número.
    expect(enSub11.dorsal).toBeNull();
  });

  it('vincularNuevoEquipo repetido no duplica la ficha en el equipo destino', async () => {
    const { sub9, sub11 } = await escenario('Sin duplicar');
    const jacob = await jugadores.crear(sub9.id, 'Jacob Restrepo', 10);

    const primeraVez = await jugadores.vincularNuevoEquipo(
      sub11.id,
      { nombre: 'Jacob Restrepo', dorsal: 7 },
      jacob.id,
    );

    // Doble tap, o repetir el mismo flujo de "Ya en otro equipo" por error:
    // no debe crear una segunda ficha de Jacob en Sub-11.
    const segundaVez = await jugadores.vincularNuevoEquipo(
      sub11.id,
      { nombre: 'Jacob Restrepo', dorsal: 7 },
      jacob.id,
    );

    expect(segundaVez.id).toBe(primeraVez.id);

    const enSub11 = await jugadores.listar(sub11.id);
    expect(enSub11.filter((j) => j.nombre === 'Jacob Restrepo')).toHaveLength(1);
  });

  it('buscarVariosEnAcademia encuentra varios nombres en una sola consulta', async () => {
    const { academia, sub9, sub11 } = await escenario('Varios nombres');
    const jacob = await jugadores.crear(sub9.id, 'Jacob Restrepo', 10);
    const andres = await jugadores.crear(sub9.id, 'Andrés', 7);
    await jugadores.crear(sub9.id, 'Sin buscar', 3);

    const candidatos = await jugadores.buscarVariosEnAcademia(
      academia.id,
      ['Jacob Restrepo', 'andrés', 'Nadie con este nombre'],
      sub11.id,
    );

    expect(candidatos.map((c) => c.jugadorId).sort()).toEqual([andres.id, jacob.id].sort());
  });

  it('resolverOCrear sigue sin buscar fuera del equipo (a propósito)', async () => {
    const { sub9, sub11 } = await escenario('Sin cruzar');
    const enSub9 = await jugadores.crear(sub9.id, 'Jacob Restrepo', 10);

    // resolverOCrear no conoce `buscarEnAcademia`/`vincularNuevoEquipo`: crea
    // una ficha nueva sin vínculo, aunque ya exista el mismo nombre en Sub-9.
    // Es a propósito — ver el comentario del método. `cargar.flujo.ts` es
    // quien decide preguntar antes de llegar a este camino.
    const { jugador, creado } = await jugadores.resolverOCrear(sub11.id, {
      nombre: 'Jacob Restrepo',
    });

    expect(creado).toBe(true);
    expect(jugador.id).not.toBe(enSub9.id);

    const filas = await db.db.execute(
      sql`select persona_id from jugadores where id = ${jugador.id}`,
    );
    expect(filas[0].persona_id).toBeNull();
  });
});
