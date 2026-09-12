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
import { EntrenamientosModule } from '../src/entrenamientos.module';
import { EntrenamientosService } from '../src/entrenamientos/entrenamientos.service';
import { EquiposService } from '../src/equipos/equipos.service';
import { IdentidadModule } from '../src/identidad/identidad.module';
import { IdentidadService } from '../src/identidad/identidad.service';
import { MembresiasService } from '../src/identidad/membresias.service';
import { JugadoresService } from '../src/jugadores/jugadores.service';
import { OrganizacionModule } from '../src/organizacion.module';
import { hoyLocal, sumarDias } from '../src/partidos/fechas';

/**
 * `/nuevoentrenamiento`, `/asistencia` y `/asistencias`, tal como los vería
 * un DT en el chat -- misma forma que `carga-conversacion.e2e-spec.ts`, pero
 * para asistencia a entrenamientos.
 */
describe('Asistencia a entrenamientos, conversación completa (e2e)', () => {
  let app: TestingModule;
  let procesador: ProcesadorMensajes;
  let adaptador: FakeChannelAdapter;
  let db: DbService;
  let academias: AcademiasService;
  let equipos: EquiposService;
  let jugadores: JugadoresService;
  let identidad: IdentidadService;
  let membresias: MembresiasService;
  let entrenamientos: EntrenamientosService;

  let siguiente = 1;
  const nuevoCanal = () => {
    const id = String(970000 + siguiente++);
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
        EntrenamientosModule,
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
    entrenamientos = app.get(EntrenamientosService);
  });

  afterAll(async () => {
    await db.db.execute(sql`delete from academias where nombre like 'ASIS %'`);
    await app.close();
  });

  beforeEach(() => adaptador.limpiar());

  /** Academia + equipo + plantilla, con el usuario ya como admin. */
  const escenario = async (nombre: string) => {
    const canal = nuevoCanal();
    const usuarioId = await identidad.resolverUsuario(textoDePrueba('', canal));
    const academia = await academias.crear(`ASIS ${nombre}`);
    const equipo = await equipos.crear(
      academia.id,
      'Sub-11',
      { cantidadTiempos: 2, minutosPorTiempo: 25 },
      usuarioId,
    );

    await jugadores.crear(equipo.id, 'Jacob', 10);
    await jugadores.crear(equipo.id, 'Andrés', 7);

    let conBotones = '1';
    const recordarPanel = () => {
      const ultimo = [...adaptador.enviados].reverse().find((e) => e.respuesta.botones?.length);

      if (ultimo) conBotones = ultimo.mensajeId;
    };

    const decir = async (texto: string) => {
      await procesador.procesar(textoDePrueba(texto, canal));
      recordarPanel();
    };

    const tocar = async (id: string) => {
      await procesador.procesar(seleccionDePrueba(id, { ...canal, mensajeOrigenId: conBotones }));
      recordarPanel();
    };

    return { canal, usuarioId, academia, equipo, decir, tocar };
  };

  describe('/nuevoentrenamiento', () => {
    it('crea una sesión puntual para hoy', async () => {
      const { equipo, decir, tocar } = await escenario('Puntual');

      await decir('/nuevoentrenamiento');
      expect(adaptador.ultimoTexto).toContain('¿Se repite todas las semanas?');

      await tocar('rec:no');
      expect(adaptador.ultimoTexto).toContain('¿Qué día es el entrenamiento?');

      await tocar(adaptador.ultimosBotones[0].id); // Hoy
      expect(adaptador.ultimoTexto).toContain('Entrenamiento creado ✅ Sub-11');

      const pendientes = await entrenamientos.pendientesDeAsistencia(equipo.id);
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0]).toMatchObject({ equipoId: equipo.id, fecha: hoyLocal() });
    });

    it('crea una regla recurrente y materializa de una la sesión de hoy, sin preguntar fecha', async () => {
      const { equipo, decir, tocar } = await escenario('Recurrente');
      const hoyDia = new Date(`${hoyLocal()}T00:00:00Z`).getUTCDay();
      const otroDia = (hoyDia + 1) % 7;

      await decir('/nuevoentrenamiento');
      await tocar('rec:si');
      expect(adaptador.ultimoTexto).toContain('¿Qué días entrenan?');

      await tocar(`dia:${hoyDia}`);
      await tocar(`dia:${otroDia}`);
      await tocar('sm:listo');

      expect(adaptador.ultimoTexto).toContain('Entrenamiento recurrente creado ✅ Sub-11');
      expect(adaptador.ultimoTexto).toContain('Ya quedó lista la sesión de hoy');

      // La primera sesión (la de hoy) ya quedó materializada, sin haber
      // llamado a /asistencia todavía.
      const pendientes = await entrenamientos.pendientesDeAsistencia(equipo.id);
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0].fecha).toBe(hoyLocal());
    });

    it('regla recurrente cuyos días NO incluyen hoy: no materializa nada, y lo dice sin sugerir /asistencia todavía', async () => {
      const { decir, tocar } = await escenario('Recurrente sin hoy');
      const hoyDia = new Date(`${hoyLocal()}T00:00:00Z`).getUTCDay();
      const otroDia = (hoyDia + 1) % 7; // nunca coincide con hoy

      await decir('/nuevoentrenamiento');
      await tocar('rec:si');
      await tocar(`dia:${otroDia}`);
      await tocar('sm:listo');

      expect(adaptador.ultimoTexto).toContain('Entrenamiento recurrente creado ✅ Sub-11');
      expect(adaptador.ultimoTexto).toContain('Todavía no hay sesión de hoy');
      expect(adaptador.ultimoTexto).toContain('La próxima se crea sola');
    });

    it('un Viewer no puede crear entrenamientos', async () => {
      const { equipo } = await escenario('Sin permiso');
      const canalViewer = nuevoCanal();
      const viewerId = await identidad.resolverUsuario(textoDePrueba('', canalViewer));
      await membresias.asignarRol(viewerId, equipo.id, 'viewer');

      await procesador.procesar(textoDePrueba('/nuevoentrenamiento', canalViewer));

      // Sin rol de Editor en ningún equipo, `pasoSelectorEquipo` ni siquiera
      // llega a preguntar cuál -- termina de una con el aviso de permiso.
      expect(adaptador.ultimoTexto).toContain('No tienes permiso para cargar en ningún equipo');
    });
  });

  describe('/asistencia', () => {
    it('marca presentes tocando botones sobre una sesión ya creada', async () => {
      const { equipo, usuarioId, decir, tocar } = await escenario('Marcar presentes');

      await entrenamientos.crearPuntual(equipo.id, hoyLocal(), usuarioId);

      await decir('/asistencia');
      expect(adaptador.ultimoTexto).toContain('Marca a quiénes están presentes');

      const botonJacob = adaptador.ultimosBotones.find((b) => b.texto.includes('Jacob'));
      if (!botonJacob) throw new Error('No encontré el botón de Jacob');

      await tocar(botonJacob.id);
      await tocar('sm:listo');

      expect(adaptador.ultimoTexto).toContain('Asistencia guardada ✅ 1/2 presentes.');
    });

    it('sin ningún entrenamiento pendiente, lo dice y no falla', async () => {
      const { decir } = await escenario('Sin pendientes');

      await decir('/asistencia');

      expect(adaptador.ultimoTexto).toContain('No hay ningún entrenamiento sin asistencia');
    });

    it('con una recurrencia activa que hoy no le toca, avisa la próxima fecha en vez de sugerir crear otra (bug reportado)', async () => {
      const { equipo, usuarioId, decir } = await escenario('Recurrencia futura');
      const hoyDia = new Date(`${hoyLocal()}T00:00:00Z`).getUTCDay();
      const otroDia = (hoyDia + 1) % 7; // nunca coincide con hoy

      // Mismo escenario que reportó el usuario: crea la recurrencia con
      // /nuevoentrenamiento, pero para un día que no es hoy.
      await entrenamientos.crearRecurrente(equipo.id, [otroDia], usuarioId);

      await decir('/asistencia');

      expect(adaptador.ultimoTexto).toContain('Ya tenés una recurrencia activa');
      expect(adaptador.ultimoTexto).toContain('la próxima se crea sola');
      // El bug era justamente que decía esto -- correr /nuevoentrenamiento
      // de nuevo solo duplicaría la regla, no arregla nada.
      expect(adaptador.ultimoTexto).not.toContain('Crea uno con /nuevoentrenamiento');
    });

    it('con más de un entrenamiento pendiente, pregunta cuál', async () => {
      const { equipo, usuarioId, decir, tocar } = await escenario('Varios pendientes');

      await entrenamientos.crearPuntual(equipo.id, sumarDias(hoyLocal(), -7), usuarioId);
      await entrenamientos.crearPuntual(equipo.id, sumarDias(hoyLocal(), -14), usuarioId);

      await decir('/asistencia');
      expect(adaptador.ultimoTexto).toContain('¿De cuál entrenamiento tomas asistencia?');
      expect(adaptador.ultimosBotones).toHaveLength(2);

      await tocar(adaptador.ultimosBotones[0].id);
      expect(adaptador.ultimoTexto).toContain('Marca a quiénes están presentes');

      await tocar('sm:ninguno');
      await tocar('sm:listo');
      expect(adaptador.ultimoTexto).toContain('0/2 presentes');
    });
  });

  describe('/asistencias', () => {
    it('sin argumento resume cuántos entrenamientos y el % de asistencia', async () => {
      const { equipo, usuarioId, decir, tocar } = await escenario('Resumen');

      await entrenamientos.crearPuntual(equipo.id, hoyLocal(), usuarioId);
      await decir('/asistencia');

      const botonJacob = adaptador.ultimosBotones.find((b) => b.texto.includes('Jacob'));
      if (!botonJacob) throw new Error('No encontré el botón de Jacob');
      await tocar(botonJacob.id);
      await tocar('sm:listo');

      await decir('/asistencias');
      expect(adaptador.ultimoTexto).toContain('Sub-11: 1 entrenamientos · 50% de asistencia');
    });

    it('con un nombre, muestra el historial presente/ausente de ese jugador', async () => {
      const { equipo, usuarioId, decir, tocar } = await escenario('Historial jugador');

      await entrenamientos.crearPuntual(equipo.id, hoyLocal(), usuarioId);
      await decir('/asistencia');
      const botonJacob = adaptador.ultimosBotones.find((b) => b.texto.includes('Jacob'));
      if (!botonJacob) throw new Error('No encontré el botón de Jacob');
      await tocar(botonJacob.id);
      await tocar('sm:listo');

      await decir('/asistencias Jacob');
      expect(adaptador.ultimoTexto).toContain('Jacob #10 — Sub-11');
      expect(adaptador.ultimoTexto).toContain('Asistencia: 1/1');

      await decir('/asistencias Andrés');
      expect(adaptador.ultimoTexto).toContain('Asistencia: 0/1');
    });

    it('con una fecha, muestra la planilla completa (presentes y ausentes)', async () => {
      const { equipo, usuarioId, decir, tocar } = await escenario('Planilla del día');

      await entrenamientos.crearPuntual(equipo.id, hoyLocal(), usuarioId);
      await decir('/asistencia');
      const botonJacob = adaptador.ultimosBotones.find((b) => b.texto.includes('Jacob'));
      if (!botonJacob) throw new Error('No encontré el botón de Jacob');
      await tocar(botonJacob.id);
      await tocar('sm:listo');

      await decir('/asistencias hoy');
      expect(adaptador.ultimoTexto).toContain('Sub-11 — hoy (1/2)');
      expect(adaptador.ultimoTexto).toContain('✅ #10 Jacob');
      expect(adaptador.ultimoTexto).toContain('❌ #7 Andrés');
    });

    it('una fecha sin entrenamiento en ningún equipo del usuario lo dice', async () => {
      const { decir } = await escenario('Sin sesión ese día');

      await decir('/asistencias 01-01');
      expect(adaptador.ultimoTexto).toContain('Ningún equipo tuyo tuvo entrenamiento el');
    });
  });

  describe('recurrencia bajo demanda', () => {
    it('asegurarSesionDeHoy materializa una sesión cuando el día pedido matchea la regla, sin duplicar si se llama dos veces', async () => {
      const { equipo, usuarioId } = await escenario('Recurrencia bajo demanda');
      const proximoMartes = sumarDias(hoyLocal(), 7); // cualquier fecha futura sirve de "hoy simulado"
      const diaDeEsaFecha = new Date(`${proximoMartes}T00:00:00Z`).getUTCDay();

      await entrenamientos.crearRecurrente(equipo.id, [diaDeEsaFecha], usuarioId, proximoMartes);

      // Ya se materializó al crear la regla (la fecha ancla coincide); llamar
      // de nuevo para la misma fecha no debe duplicar la sesión.
      const primera = await entrenamientos.asegurarSesionDeHoy(equipo.id, usuarioId, proximoMartes);
      const segunda = await entrenamientos.asegurarSesionDeHoy(equipo.id, usuarioId, proximoMartes);

      expect(primera?.id).toBe(segunda?.id);

      const todas = await entrenamientos.pendientesDeAsistencia(equipo.id);
      expect(todas.filter((e) => e.fecha === proximoMartes)).toHaveLength(1);
    });

    it('sin ninguna regla activa, no materializa nada', async () => {
      const { equipo, usuarioId } = await escenario('Sin reglas');

      const resultado = await entrenamientos.asegurarSesionDeHoy(equipo.id, usuarioId);

      expect(resultado).toBeNull();
    });
  });
});
