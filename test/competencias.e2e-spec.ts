import { sql } from 'drizzle-orm';
import { Test, type TestingModule } from '@nestjs/testing';
import { AcademiasService } from '../src/academias/academias.service';
import { textoDePrueba } from '../src/channels/testing/fake.adapter';
import { CompetenciasService } from '../src/competencias/competencias.service';
import { ConfigModule } from '../src/config/config.module';
import { ConversacionModule } from '../src/conversacion/conversacion.module';
import { RedisModule } from '../src/core/redis/redis.module';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { EquiposService } from '../src/equipos/equipos.service';
import { IdentidadModule } from '../src/identidad/identidad.module';
import { IdentidadService } from '../src/identidad/identidad.service';
import { OrganizacionModule } from '../src/organizacion.module';
import { PartidosModule } from '../src/partidos.module';
import { hoyLocal } from '../src/partidos/fechas';
import { PartidosService } from '../src/partidos/partidos.service';

/**
 * Competencias por academia: que dos escrituras casi iguales no dupliquen, y
 * que dos equipos de la misma academia compartan lo que ya se creó.
 *
 * Va contra Postgres real porque lo que se prueba es justamente el índice
 * único de `competencias` resolviendo una carrera de inserción — en memoria
 * el test pasaría aunque el índice no existiera.
 */
describe('Competencias (e2e)', () => {
  let app: TestingModule;
  let db: DbService;
  let competencias: CompetenciasService;
  let partidos: PartidosService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let identidad: IdentidadService;

  let siguiente = 1;
  const nuevoCanalId = () => String(990000 + siguiente++);

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
    competencias = app.get(CompetenciasService);
    partidos = app.get(PartidosService);
    academias = app.get(AcademiasService);
    equipos = app.get(EquiposService);
    identidad = app.get(IdentidadService);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'COMP %'`);
    await app.close();
  });

  const usuario = async (): Promise<string> => {
    const canalUserId = nuevoCanalId();

    return identidad.resolverUsuario(textoDePrueba('', { canalUserId, chatId: canalUserId }));
  };

  it('reusa la competencia aunque cambien mayúsculas o espacios', async () => {
    const admin = await usuario();
    const academia = await academias.crear('COMP Dedup');

    const primera = await competencias.obtenerOCrear(academia.id, 'Liga del Atlántico', admin);
    const segunda = await competencias.obtenerOCrear(academia.id, '  liga DEL atlántico  ', admin);

    expect(segunda.id).toBe(primera.id);
  });

  it('dos escrituras casi simultáneas del mismo nombre no duplican (índice único)', async () => {
    const admin = await usuario();
    const academia = await academias.crear('COMP Carrera');

    const [uno, dos] = await Promise.all([
      competencias.obtenerOCrear(academia.id, 'Torneo Relámpago', admin),
      competencias.obtenerOCrear(academia.id, 'Torneo Relámpago', admin),
    ]);

    expect(uno.id).toBe(dos.id);

    const filas = await db.db.execute(
      sql`select count(*)::int as n from competencias where academia_id = ${academia.id}`,
    );
    expect(filas[0].n).toBe(1);
  });

  it('dos equipos de la misma academia ven y reusan la misma competencia', async () => {
    const admin = await usuario();
    const academia = await academias.crear('COMP Compartida');
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

    const creada = await competencias.obtenerOCrear(academia.id, 'Liga del Atlántico', admin);

    await partidos.crear({
      equipoId: sub9.id,
      rival: 'Rival A',
      fecha: hoyLocal(),
      competenciaId: creada.id,
      formato: { cantidadTiempos: 2, minutosPorTiempo: 20 },
      creadoPor: admin,
    });

    // Sub-11 no jugó nada todavía con esta competencia, pero igual la ve:
    // es de la academia, no del equipo que la usó primero.
    const vistasPorSub11 = await competencias.deLaAcademia(academia.id);
    expect(vistasPorSub11.map((c) => c.id)).toContain(creada.id);

    const partidoSub11 = await partidos.crear({
      equipoId: sub11.id,
      rival: 'Rival B',
      fecha: hoyLocal(),
      competenciaId: creada.id,
      formato: { cantidadTiempos: 2, minutosPorTiempo: 25 },
      creadoPor: admin,
    });

    expect(partidoSub11.competenciaId).toBe(creada.id);
    expect(partidoSub11.competenciaNombre).toBe('Liga del Atlántico');
  });

  it('sin competencia elegida, el partido y el resumen la omiten', async () => {
    const admin = await usuario();
    const academia = await academias.crear('COMP Ninguna');
    const equipo = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin,
    );

    const partido = await partidos.crear({
      equipoId: equipo.id,
      rival: 'Rival',
      fecha: hoyLocal(),
      formato: { cantidadTiempos: 2, minutosPorTiempo: 25 },
      creadoPor: admin,
    });

    expect(partido.competenciaId).toBeNull();
    expect(partido.competenciaNombre).toBeNull();
  });
});
