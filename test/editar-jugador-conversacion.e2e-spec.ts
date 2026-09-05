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
 * `/editarjugador`: posición y datos básicos, conversación completa —
 * selector de equipo → elegir jugador → menú → cada dato vuelve al menú.
 */
describe('Editar jugador: posición y datos básicos (e2e)', () => {
  let app: TestingModule;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;
  let db: DbService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let jugadores: JugadoresService;
  let identidad: IdentidadService;

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
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'EJ %'`);
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
    const academia = await academias.crear(`EJ ${nombre}`);
    const equipo = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      admin.usuarioId,
    );

    return { admin, academia, equipo };
  };

  it('carga posición, fecha de nacimiento, peso y estatura, uno a uno', async () => {
    const { admin, equipo } = await escenario('Flujo completo');
    const jacob = await jugadores.crear(equipo.id, 'Jacob Restrepo', 10);

    const decir = (texto: string) => procesador.procesar(textoDePrueba(texto, admin));
    const tocar = (id: string) => procesador.procesar(seleccionDePrueba(id, admin));

    // Un solo equipo: el selector no pregunta, va directo a elegir jugador.
    await decir('/editarjugador');
    expect(adaptador.ultimoTexto).toContain('¿A quién editas?');

    await tocar(`ej:j:${jacob.id}`);
    expect(adaptador.ultimoTexto).toContain('Editando a Jacob Restrepo #10');
    expect(adaptador.ultimosBotones.map((b) => b.id)).toEqual([
      'ej:m:posicion',
      'ej:m:fecha',
      'ej:m:peso',
      'ej:m:estatura',
      'ej:m:listo',
    ]);

    // Posición: cuatro botones, sin texto libre.
    await tocar('ej:m:posicion');
    expect(adaptador.ultimoTexto).toContain('¿En qué posición juega?');
    expect(adaptador.ultimosBotones.map((b) => b.id)).toEqual([
      'ej:p:arquero',
      'ej:p:defensa',
      'ej:p:mediocampista',
      'ej:p:delantero',
    ]);

    await tocar('ej:p:defensa');
    expect(adaptador.ultimoTexto).toContain('Guardado ✅');
    expect(adaptador.ultimoTexto).toContain('Editando a Jacob Restrepo #10');

    // Fecha de nacimiento: rechaza una inválida antes de aceptar la buena.
    await tocar('ej:m:fecha');
    expect(adaptador.ultimoTexto).toContain('Fecha de nacimiento');

    await decir('31/02/2015');
    expect(adaptador.ultimoTexto).toContain('No entendí esa fecha');

    await decir('10/05/2015');
    expect(adaptador.ultimoTexto).toContain('Guardado ✅');

    // Peso: rechaza fuera de rango antes de aceptar el bueno.
    await tocar('ej:m:peso');
    await decir('200');
    expect(adaptador.ultimoTexto).toContain('Ese peso no me cuadra');

    await decir('35,5');
    expect(adaptador.ultimoTexto).toContain('Guardado ✅');

    // Estatura: rechaza fuera de rango antes de aceptar la buena.
    await tocar('ej:m:estatura');
    await decir('300');
    expect(adaptador.ultimoTexto).toContain('Esa estatura no me cuadra');

    await decir('140');
    expect(adaptador.ultimoTexto).toContain('Guardado ✅');

    await tocar('ej:m:listo');
    expect(adaptador.ultimoTexto).toContain('Listo');

    const [fila] = await db.db.execute<{
      posicion: string;
      fecha_nacimiento: string;
      peso_kg: string;
      estatura_cm: number;
    }>(
      sql`select posicion, fecha_nacimiento, peso_kg, estatura_cm from jugadores where id = ${jacob.id}`,
    );

    expect(fila.posicion).toBe('defensa');
    expect(String(fila.fecha_nacimiento)).toContain('2015-05-10');
    expect(Number(fila.peso_kg)).toBe(35.5);
    expect(Number(fila.estatura_cm)).toBe(140);
  });

  it('no permite editar a quien perdió el rol de editor entre el menú y el guardado', async () => {
    const { admin, equipo } = await escenario('Sin permiso');
    const jacob = await jugadores.crear(equipo.id, 'Jacob Restrepo', 10);

    const decir = (texto: string) => procesador.procesar(textoDePrueba(texto, admin));
    const tocar = (id: string) => procesador.procesar(seleccionDePrueba(id, admin));

    await decir('/editarjugador');
    await tocar(`ej:j:${jacob.id}`);
    await tocar('ej:m:posicion');

    // El rol se revoca justo antes de contestar -- mismo patrón de
    // revalidación que el resto de los flujos que editan la plantilla.
    await db.db.execute(
      sql`delete from usuarios_equipos where equipo_id = ${equipo.id} and usuario_id = ${admin.usuarioId}`,
    );

    await tocar('ej:p:defensa');
    expect(adaptador.ultimoTexto).toContain('No tienes permiso');

    const [fila] = await db.db.execute<{ posicion: string | null }>(
      sql`select posicion from jugadores where id = ${jacob.id}`,
    );
    expect(fila.posicion).toBeNull();
  });
});
