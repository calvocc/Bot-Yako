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
import { EventosService } from '../src/eventos/eventos.service';
import { IdentidadModule } from '../src/identidad/identidad.module';
import { IdentidadService } from '../src/identidad/identidad.service';
import { MembresiasService } from '../src/identidad/membresias.service';
import { JugadoresService } from '../src/jugadores/jugadores.service';
import { OrganizacionModule } from '../src/organizacion.module';
import { PartidosModule } from '../src/partidos.module';
import { hoyLocal } from '../src/partidos/fechas';
import { PartidosService } from '../src/partidos/partidos.service';
import { TiemposService } from '../src/partidos/tiempos.service';

/**
 * El corazón de la fase: cargar un partido mientras se juega, con dos personas
 * a la vez.
 *
 * Va contra Postgres real porque todo lo que se prueba acá —el chequeo de
 * duplicados, los locks de tiempo, el marcador que deja el trigger— vive en la
 * base. En memoria estos tests pasarían aunque el código estuviera mal.
 */
describe('Partido en vivo (e2e)', () => {
  let app: TestingModule;
  let db: DbService;
  let partidos: PartidosService;
  let tiempos: TiemposService;
  let eventos: EventosService;
  let jugadores: JugadoresService;
  let identidad: IdentidadService;
  let membresias: MembresiasService;
  let academias: AcademiasService;
  let equipos: EquiposService;

  let siguiente = 1;
  const nuevoCanalId = () => String(970000 + siguiente++);

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
    partidos = app.get(PartidosService);
    tiempos = app.get(TiemposService);
    eventos = app.get(EventosService);
    jugadores = app.get(JugadoresService);
    identidad = app.get(IdentidadService);
    membresias = app.get(MembresiasService);
    academias = app.get(AcademiasService);
    equipos = app.get(EquiposService);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'VIVO %'`);
    await app.close();
  });

  const usuario = async (): Promise<string> => {
    const canalUserId = nuevoCanalId();

    return identidad.resolverUsuario(textoDePrueba('', { canalUserId, chatId: canalUserId }));
  };

  /** Academia, equipo, plantilla y partido listos para cargar. */
  const escenario = async (nombre: string) => {
    const admin = await usuario();
    const academia = await academias.crear(`VIVO ${nombre}`);
    const equipo = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin,
    );

    const jacob = await jugadores.crear(equipo.id, 'Jacob', 10);
    const andres = await jugadores.crear(equipo.id, 'Andrés', 7);

    const partido = await partidos.crear({
      equipoId: equipo.id,
      rival: 'Deportivo Norte',
      fecha: hoyLocal(),
      competencia: 'Liga',
      formato: { cantidadTiempos: 2, minutosPorTiempo: 25 },
      creadoPor: admin,
    });

    return { admin, academia, equipo, jacob, andres, partido };
  };

  const gol = (partidoId: string, reportadoPor: string, jugadorId: string | null) =>
    eventos.registrar({
      partidoId,
      tipo: 'gol' as const,
      equipoOrigen: 'propio' as const,
      jugadorId,
      reportadoPor,
    });

  describe('criterio de aceptación #3: dos editores, un solo gol', () => {
    it('con dos cargas simultáneas del mismo gol guarda una y pregunta por la otra', async () => {
      const { admin, equipo, jacob, partido } = await escenario('Duplicado');
      const editor = await usuario();
      await membresias.asignarRol(editor, equipo.id, 'editor');

      await tiempos.iniciarEnVivo(partido.id, admin);

      // Sin lock, ambas leerían la ventana vacía y ambas escribirían: es
      // exactamente la carrera que describe B3.
      const [uno, dos] = await Promise.all([
        gol(partido.id, admin, jacob.id),
        gol(partido.id, editor, jacob.id),
      ]);

      const tipos = [uno.tipo, dos.tipo].sort();
      expect(tipos).toEqual(['posible_duplicado', 'registrado']);

      const guardados = await eventos.delPartido(partido.id);
      expect(guardados).toHaveLength(1);

      const actualizado = await partidos.obtener(partido.id);
      expect(actualizado?.marcadorPropio).toBe(1);
    });

    it('deja pasar el segundo reporte si el usuario dice que es otro gol', async () => {
      const { admin, jacob, partido } = await escenario('Es otro');
      await tiempos.iniciarEnVivo(partido.id, admin);

      await gol(partido.id, admin, jacob.id);
      const segundo = await eventos.registrar({
        partidoId: partido.id,
        tipo: 'gol',
        equipoOrigen: 'propio',
        jugadorId: jacob.id,
        reportadoPor: admin,
        forzar: true,
      });

      expect(segundo.tipo).toBe('registrado');
      expect(await eventos.delPartido(partido.id)).toHaveLength(2);
    });

    it('no pregunta cuando los goleadores son distintos (M1)', async () => {
      const { admin, jacob, andres, partido } = await escenario('M1');
      await tiempos.iniciarEnVivo(partido.id, admin);

      await gol(partido.id, admin, jacob.id);
      const segundo = await gol(partido.id, admin, andres.id);

      expect(segundo.tipo).toBe('registrado');
      expect(await eventos.delPartido(partido.id)).toHaveLength(2);
    });
  });

  describe('tiempos', () => {
    it('arranca el siguiente tiempo solo al cargar con el anterior cerrado (RF-3.8)', async () => {
      const { admin, jacob, partido } = await escenario('Auto tiempo');

      await tiempos.iniciarEnVivo(partido.id, admin);
      await tiempos.finalizarTiempo(partido.id, admin);

      const resultado = await tiempos.asegurarTiempoEnCurso(partido.id, admin);

      expect(resultado).toMatchObject({ tipo: 'en_curso', recienIniciado: true });
      expect(resultado.tipo === 'en_curso' && resultado.partido.tiempoActual).toBe(2);

      const evento = await gol(partido.id, admin, jacob.id);
      expect(evento.tipo === 'registrado' && evento.evento.tiempo).toBe(2);
    });

    it('no inventa un tiempo que el formato no tiene', async () => {
      const { admin, partido } = await escenario('Sin tiempos');

      await tiempos.iniciarEnVivo(partido.id, admin);
      await tiempos.finalizarTiempo(partido.id, admin);
      await tiempos.asegurarTiempoEnCurso(partido.id, admin);
      await tiempos.finalizarTiempo(partido.id, admin);

      expect(await tiempos.asegurarTiempoEnCurso(partido.id, admin)).toMatchObject({
        tipo: 'sin_tiempos',
      });
    });

    it('con dos finalizaciones simultáneas solo gana una', async () => {
      const { admin, equipo, partido } = await escenario('Carrera fin');
      const editor = await usuario();
      await membresias.asignarRol(editor, equipo.id, 'editor');

      await tiempos.iniciarEnVivo(partido.id, admin);

      const [uno, dos] = await Promise.all([
        tiempos.finalizarTiempo(partido.id, admin),
        tiempos.finalizarTiempo(partido.id, editor),
      ]);

      expect([uno.tipo, dos.tipo].sort()).toEqual(['finalizado', 'ya_finalizado']);

      // Y el tiempo quedó cerrado una sola vez, con una única hora de fin.
      const filas = await db.db.execute(
        sql`select count(*)::int as n from partido_tiempos
            where partido_id = ${partido.id} and finalizado_en is not null`,
      );
      expect(filas[0].n).toBe(1);
    });

    it('el minuto sale de la duración real del primer tiempo (C4)', async () => {
      const { admin, jacob, partido } = await escenario('Minuto real');

      await tiempos.iniciarEnVivo(partido.id, admin);

      // Un primer tiempo de 31 minutos —25 más 6 de adición— cerrado hace 5.
      await db.db.execute(
        sql`update partido_tiempos
            set iniciado_en = now() - interval '36 minutes',
                finalizado_en = now() - interval '5 minutes'
            where partido_id = ${partido.id} and numero = 1`,
      );
      await tiempos.finalizarTiempo(partido.id, admin);
      await tiempos.asegurarTiempoEnCurso(partido.id, admin);
      await db.db.execute(
        sql`update partido_tiempos set iniciado_en = now() - interval '5 minutes'
            where partido_id = ${partido.id} and numero = 2`,
      );

      const evento = await gol(partido.id, admin, jacob.id);

      // 31 reales + 5 corridos. Con la duración configurada daría 30.
      expect(evento.tipo === 'registrado' && evento.evento.minutoCalculado).toBe(36);
    });
  });

  it('propone las competencias que el equipo ya jugó', async () => {
    const { equipo } = await escenario('Competencias');

    expect(await partidos.competenciasDe(equipo.id)).toEqual(['Liga']);
  });

  describe('marcador y deshacer', () => {
    it('el trigger sigue la secuencia gol → autogol → deshacer', async () => {
      const { admin, jacob, partido } = await escenario('Marcador');
      await tiempos.iniciarEnVivo(partido.id, admin);

      await gol(partido.id, admin, jacob.id);
      expect((await partidos.obtener(partido.id))?.marcadorPropio).toBe(1);

      // Autogol propio: el que suma es el rival.
      await eventos.registrar({
        partidoId: partido.id,
        tipo: 'autogol',
        equipoOrigen: 'propio',
        jugadorId: jacob.id,
        reportadoPor: admin,
      });

      let estado = await partidos.obtener(partido.id);
      expect([estado?.marcadorPropio, estado?.marcadorRival]).toEqual([1, 1]);

      await eventos.deshacerUltimo(partido.id, admin, true);

      estado = await partidos.obtener(partido.id);
      expect([estado?.marcadorPropio, estado?.marcadorRival]).toEqual([1, 0]);
    });

    it('un editor no puede deshacer lo que cargó otro, un admin sí', async () => {
      const { admin, equipo, jacob, partido } = await escenario('Deshacer ajeno');
      const editor = await usuario();
      await membresias.asignarRol(editor, equipo.id, 'editor');

      await tiempos.iniciarEnVivo(partido.id, admin);
      await gol(partido.id, admin, jacob.id);

      expect(await eventos.deshacerUltimo(partido.id, editor, false)).toMatchObject({
        tipo: 'ajeno',
      });
      expect(await eventos.delPartido(partido.id)).toHaveLength(1);

      expect(await eventos.deshacerUltimo(partido.id, admin, true)).toMatchObject({
        tipo: 'deshecho',
      });
      expect(await eventos.delPartido(partido.id)).toHaveLength(0);
    });
  });

  describe('cierre y reapertura', () => {
    it('guarda el marcador confirmado aunque difiera del derivado (C5)', async () => {
      const { admin, jacob, partido } = await escenario('Cierre');
      await tiempos.iniciarEnVivo(partido.id, admin);
      await gol(partido.id, admin, jacob.id);

      const cierre = await partidos.cerrar(partido.id, admin, { propio: 3, rival: 1 });

      expect(cierre.tipo).toBe('cerrado');
      expect(cierre.tipo === 'cerrado' && cierre.partido.marcadorPropioConfirmado).toBe(3);
      // El derivado de los eventos no se toca: sigue contando lo que se cargó.
      expect(cierre.tipo === 'cerrado' && cierre.partido.marcadorPropio).toBe(1);
    });

    it('con dos cierres simultáneos solo uno escribe su marcador', async () => {
      const { admin, equipo, partido } = await escenario('Carrera cierre');
      const editor = await usuario();
      await membresias.asignarRol(editor, equipo.id, 'editor');

      await tiempos.iniciarEnVivo(partido.id, admin);

      const [uno, dos] = await Promise.all([
        partidos.cerrar(partido.id, admin, { propio: 2, rival: 0 }),
        partidos.cerrar(partido.id, editor, { propio: 5, rival: 5 }),
      ]);

      expect([uno.tipo, dos.tipo].sort()).toEqual(['cerrado', 'ya_cerrado']);

      const ganador = uno.tipo === 'cerrado' ? uno : dos;
      const final = await partidos.obtener(partido.id);

      expect(final?.marcadorPropioConfirmado).toBe(
        ganador.tipo === 'cerrado' ? ganador.partido.marcadorPropioConfirmado : null,
      );
    });

    it('no se cuela un gol leído antes del cierre pero escrito después (cierre vs. carga)', async () => {
      // `registrar()` leía el partido con un SELECT sin `for update`: la
      // guarda de `estado === 'cerrado'` podía pasar sobre un snapshot de
      // antes del cierre y el evento se insertaba igual —el trigger de
      // marcador solo se topa con el lock de `cerrar()` más tarde, al hacer
      // su propio UPDATE— así que la escritura se colaba después de que el
      // partido ya había quedado cerrado, y al usuario se le confirmaba que
      // se guardó. Se simula el instante exacto: `cerrar()` ya tomó el lock
      // y todavía no cerró, así que si la carga solo se demora un poco (el
      // bug) en vez de releer el estado ya cerrado (el fix), se nota acá.
      const { admin, jacob, partido } = await escenario('Cierre vs carga');
      await tiempos.iniciarEnVivo(partido.id, admin);

      let soltarCierre: () => void = () => {};
      const cierreEnEspera = new Promise<void>((resolve) => {
        soltarCierre = resolve;
      });

      const cierrePromesa = db.db.transaction(async (tx) => {
        await tx.execute(sql`select * from partidos where id = ${partido.id} for update`);
        await cierreEnEspera;
        await tx.execute(sql`update partidos set estado = 'cerrado' where id = ${partido.id}`);
      });

      let resuelto = false;
      const cargaPromesa = gol(partido.id, admin, jacob.id).then((r) => {
        resuelto = true;
        return r;
      });

      // Con el lock tomado y el cierre todavía sin escribir, la carga tiene
      // que quedarse esperando, no colarse con el estado de antes.
      await new Promise((r) => setTimeout(r, 150));
      expect(resuelto).toBe(false);

      soltarCierre();
      await cierrePromesa;

      const evento = await cargaPromesa;
      expect(evento.tipo).toBe('partido_cerrado');
      expect(await eventos.delPartido(partido.id)).toHaveLength(0);
    });

    it('cerrar detiene el reloj del tiempo que seguía corriendo', async () => {
      const { admin, partido } = await escenario('Reloj');
      await tiempos.iniciarEnVivo(partido.id, admin);
      await partidos.cerrar(partido.id, admin, { propio: 0, rival: 0 });

      const abiertos = await db.db.execute(
        sql`select count(*)::int as n from partido_tiempos
            where partido_id = ${partido.id} and finalizado_en is null`,
      );
      expect(abiertos[0].n).toBe(0);
    });

    it('reabrir borra el marcador confirmado y deja volver a cargar', async () => {
      const { admin, jacob, partido } = await escenario('Reabrir');
      await tiempos.iniciarEnVivo(partido.id, admin);
      await partidos.cerrar(partido.id, admin, { propio: 3, rival: 1 });

      // Cerrado, no se puede cargar nada.
      expect(await gol(partido.id, admin, jacob.id)).toMatchObject({ tipo: 'partido_cerrado' });

      const reapertura = await partidos.reabrir(partido.id);

      expect(reapertura.tipo).toBe('reabierto');
      expect(
        reapertura.tipo === 'reabierto' && reapertura.partido.marcadorPropioConfirmado,
      ).toBeNull();

      // Y con todos los tiempos jugados el evento va al último, sin reloj.
      const evento = await gol(partido.id, admin, jacob.id);
      expect(evento.tipo).toBe('registrado');
      expect(evento.tipo === 'registrado' && evento.evento.tiempo).toBe(1);
    });
  });
});
