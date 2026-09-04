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

/**
 * `/plantilla` → "Agregar" → "Ya juega en otro equipo de la academia"
 * (Frente A), como conversación completa: es el camino explícito para
 * vincular jugadores entre equipos, además de `cargar.flujo.ts` (ya cubierto
 * en `carga-conversacion.e2e-spec.ts`).
 */
describe('Plantilla: agregar jugador de otro equipo de la academia (e2e)', () => {
  let app: TestingModule;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;
  let db: DbService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let jugadores: JugadoresService;
  let identidad: IdentidadService;

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
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'PL %'`);
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
    const academia = await academias.crear(`PL ${nombre}`);
    const sub11 = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin.usuarioId,
    );
    const sub13 = await equipos.crear(
      academia.id,
      'Sub-13',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin.usuarioId,
    );

    return { admin, academia, sub11, sub13 };
  };

  it('vincula a un jugador que ya juega en otro equipo de la academia', async () => {
    const { admin, sub11, sub13 } = await escenario('Vincular conversación');
    const jacob = await jugadores.crear(sub11.id, 'Jacob Restrepo', 10);

    const decir = (texto: string) => procesador.procesar(textoDePrueba(texto, admin));
    const tocar = (id: string) => procesador.procesar(seleccionDePrueba(id, admin));

    await decir('/plantilla');
    // Admin de dos equipos: hay que elegir.
    expect(adaptador.ultimoTexto).toContain('¿De cuál equipo');

    await tocar(`eq:${sub13.id}`);
    expect(adaptador.ultimoTexto).toContain('Plantilla de Sub-13');
    expect(adaptador.ultimosBotones.some((b) => b.id === 'pl:agregar')).toBe(true);

    await tocar('pl:agregar');
    expect(adaptador.ultimoTexto).toContain('¿Cómo lo agregas?');
    expect(adaptador.ultimosBotones.map((b) => b.id)).toEqual(['pl:m:lista', 'pl:m:academia']);

    await tocar('pl:m:academia');
    expect(adaptador.ultimoTexto).toContain('Lo busco en los otros equipos');

    // Un nombre que no está en ningún otro equipo: se avisa y se puede
    // reintentar, sin trabar la conversación.
    await decir('Nadie De Nadie');
    expect(adaptador.ultimoTexto).toContain('No encontré a nadie llamado "Nadie De Nadie"');

    await decir('Jacob Restrepo');
    expect(adaptador.ultimoTexto).toContain('Elige quién es');
    expect(adaptador.ultimosBotones).toHaveLength(1);
    expect(adaptador.ultimosBotones[0].texto).toContain('Sub-11');

    await tocar(`pl:c:${jacob.id}`);
    expect(adaptador.ultimoTexto).toContain('quedó vinculado');
    expect(adaptador.ultimoTexto).toContain('Sub-11');

    const filas = await db.db.execute(
      sql`select id, persona_id from jugadores where equipo_id = ${sub13.id} and nombre = 'Jacob Restrepo'`,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].persona_id).not.toBeNull();

    const origenYVinculo = await db.db.execute(
      sql`select persona_id from jugadores where id in (${jacob.id}, ${filas[0].id})`,
    );
    expect(new Set(origenYVinculo.map((f) => f.persona_id)).size).toBe(1);
  });

  it('avisa (sin bloquear) un posible duplicado al pegar la lista de siempre', async () => {
    const { admin, sub11, sub13 } = await escenario('Aviso lista');
    await jugadores.crear(sub11.id, 'Andrés Gómez', 7);

    const decir = (texto: string) => procesador.procesar(textoDePrueba(texto, admin));
    const tocar = (id: string) => procesador.procesar(seleccionDePrueba(id, admin));

    await decir('/plantilla');
    await tocar(`eq:${sub13.id}`);
    await tocar('pl:agregar');
    await tocar('pl:m:lista');
    expect(adaptador.ultimoTexto).toContain('Ahora carga la plantilla');

    await decir('Andrés Gómez, 7');
    expect(adaptador.ultimoTexto).toContain('❓');
    expect(adaptador.ultimoTexto).toContain('también está en la plantilla de Sub-11');
    // No bloquea: el jugador queda agregado igual, como ficha propia sin vínculo.
    expect(adaptador.ultimoTexto).toContain('✅');
  });
});
