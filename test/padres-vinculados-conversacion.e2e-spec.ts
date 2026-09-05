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
import { JugadoresService } from '../src/jugadores/jugadores.service';
import { OrganizacionModule } from '../src/organizacion.module';

/**
 * Padres vinculados a jugadores (Frente B), como conversación completa:
 * `/invitarjugador` genera el código, `/unirme` lo canjea creando el vínculo
 * en `usuarios_jugadores` (no en `usuarios_equipos`), y el acceso derivado
 * (ver el equipo del hijo, como Viewer) se prueba a través de
 * `MembresiasService`, que es lo único que los demás flujos consultan.
 */
describe('Padres vinculados a jugadores (e2e)', () => {
  let app: TestingModule;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;
  let db: DbService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let jugadores: JugadoresService;
  let identidad: IdentidadService;
  let membresias: MembresiasService;

  let siguiente = 1;
  const nuevoCanalId = () => String(980000 + siguiente++);

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
    academias = app.get(AcademiasService);
    equipos = app.get(EquiposService);
    jugadores = app.get(JugadoresService);
    identidad = app.get(IdentidadService);
    membresias = app.get(MembresiasService);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'PADRES %'`);
    await app.close();
  });

  beforeEach(() => adaptador.limpiar());

  const usuario = async (): Promise<{ canalUserId: string; chatId: string; usuarioId: string }> => {
    const id = nuevoCanalId();
    const usuarioId = await identidad.resolverUsuario(
      textoDePrueba('', { canalUserId: id, chatId: id }),
    );

    return { canalUserId: id, chatId: id, usuarioId };
  };

  const escenario = async (nombre: string) => {
    const admin = await usuario();
    const academia = await academias.crear(`PADRES ${nombre}`);
    const equipo = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin.usuarioId,
    );
    const jacob = await jugadores.crear(equipo.id, 'Jacob Restrepo', 10);

    return { admin, academia, equipo, jacob };
  };

  const extraerCodigo = (texto: string): string => {
    const match = texto.match(/YAKO-[A-Z0-9]+/);
    if (!match) throw new Error(`No encontré un código en: ${texto}`);
    return match[0];
  };

  it('genera el código con /invitarjugador y lo canjea con /unirme, sin dar de alta al equipo', async () => {
    const { admin, equipo, jacob } = await escenario('Vínculo');

    // El admin genera el código: un solo equipo, así que no hay que elegirlo.
    await procesador.procesar(textoDePrueba('/invitarjugador', admin));
    expect(adaptador.ultimoTexto).toContain('¿Para cuál jugador');

    await procesador.procesar(seleccionDePrueba(`invj:${jacob.id}`, admin));
    expect(adaptador.ultimoTexto).toContain('Jacob Restrepo');
    const codigo = extraerCodigo(adaptador.ultimoTexto);

    // Un papá nuevo canjea el código.
    const papa = await usuario();
    adaptador.limpiar();
    await procesador.procesar(textoDePrueba(`/unirme ${codigo}`, papa));
    expect(adaptador.ultimoTexto).toContain('Quedaste vinculado');
    expect(adaptador.ultimoTexto).toContain('Jacob Restrepo');

    // El vínculo es de jugador, no de equipo: sin fila en usuarios_equipos.
    const filaEquipo = await db.db.execute(
      sql`select 1 from usuarios_equipos where usuario_id = ${papa.usuarioId} and equipo_id = ${equipo.id}`,
    );
    expect(filaEquipo).toHaveLength(0);

    const filaJugador = await db.db.execute(
      sql`select 1 from usuarios_jugadores where usuario_id = ${papa.usuarioId} and jugador_id = ${jacob.id}`,
    );
    expect(filaJugador).toHaveLength(1);

    // El acceso se deriva: ve el equipo como Viewer, no puede cargar eventos.
    expect(await membresias.rolEn(papa.usuarioId, equipo.id)).toBe('viewer');
    expect(await membresias.puede(papa.usuarioId, equipo.id, 'viewer')).toBe(true);
    expect(await membresias.puede(papa.usuarioId, equipo.id, 'editor')).toBe(false);

    const suyos = await membresias.equiposDe(papa.usuarioId);
    expect(suyos).toHaveLength(1);
    expect(suyos[0]).toMatchObject({ equipoId: equipo.id, rol: 'viewer' });

    // Canjear el mismo código de nuevo no rompe nada ni duplica el vínculo.
    adaptador.limpiar();
    await procesador.procesar(textoDePrueba(`/unirme ${codigo}`, papa));
    expect(adaptador.ultimoTexto).toContain('Ya estabas vinculado');

    const filasTrasSegundoCanje = await db.db.execute(
      sql`select count(*)::int as n from usuarios_jugadores where usuario_id = ${papa.usuarioId} and jugador_id = ${jacob.id}`,
    );
    expect(filasTrasSegundoCanje[0].n).toBe(1);
  });

  it('un rol directo en el equipo manda sobre el vínculo de jugador', async () => {
    const { equipo, jacob } = await escenario('Rol directo gana');
    const papaTambienEditor = await usuario();

    await membresias.vincularAJugador(papaTambienEditor.usuarioId, jacob.id);
    await membresias.asignarRol(papaTambienEditor.usuarioId, equipo.id, 'editor');

    expect(await membresias.rolEn(papaTambienEditor.usuarioId, equipo.id)).toBe('editor');

    const suyos = await membresias.equiposDe(papaTambienEditor.usuarioId);
    expect(suyos).toHaveLength(1);
    expect(suyos[0].rol).toBe('editor');
  });

  it('dar de baja al hijo revoca el acceso derivado del papá', async () => {
    const { equipo, jacob } = await escenario('Baja revoca acceso');
    const papa = await usuario();

    await membresias.vincularAJugador(papa.usuarioId, jacob.id);
    expect(await membresias.rolEn(papa.usuarioId, equipo.id)).toBe('viewer');
    expect(await membresias.equiposDe(papa.usuarioId)).toHaveLength(1);

    await jugadores.desactivar(equipo.id, jacob.id);

    // El vínculo (usuarios_jugadores) sigue existiendo, pero el jugador ya
    // no está activo: no debería seguir dando acceso al equipo.
    expect(await membresias.rolEn(papa.usuarioId, equipo.id)).toBeNull();
    expect(await membresias.puede(papa.usuarioId, equipo.id, 'viewer')).toBe(false);
    expect(await membresias.equiposDe(papa.usuarioId)).toHaveLength(0);
    expect(await membresias.hijosDe(papa.usuarioId)).toHaveLength(0);
  });

  it('/mishijos lista a los jugadores vinculados, o dice que no hay ninguno', async () => {
    const { jacob } = await escenario('Mis hijos');
    const papa = await usuario();

    await procesador.procesar(textoDePrueba('/mishijos', papa));
    expect(adaptador.ultimoTexto).toContain('Todavía no estás vinculado');

    await membresias.vincularAJugador(papa.usuarioId, jacob.id);

    adaptador.limpiar();
    await procesador.procesar(textoDePrueba('/mishijos', papa));
    expect(adaptador.ultimoTexto).toContain('Jacob Restrepo');
    expect(adaptador.ultimoTexto).toContain('Sub-11');
  });
});
