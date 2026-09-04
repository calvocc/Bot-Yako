import { Injectable } from '@nestjs/common';
import type { MensajeAdicional, RespuestaBot } from '../channels/channel.types';
import {
  botonesPaginados,
  ID_VER_MAS,
  paginaSiguiente,
} from '../conversacion/pasos-comunes/paginacion';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import type {
  ContextoFlujo,
  DatosFlujo,
  Entrada,
  Flujo,
  Paso,
  Transicion,
} from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import { MembresiasService } from '../identidad/membresias.service';
import { describirJugador, JugadoresService, parsearJugador } from '../jugadores/jugadores.service';
import { describirFecha } from '../partidos/fechas';
import { describirMinuto } from '../partidos/minuto';
import { describirMarcador, type Partido } from '../partidos/partido.mapper';
import { PartidosService } from '../partidos/partidos.service';
import { TiemposService, type ResultadoFinTiempo } from '../partidos/tiempos.service';
import { ResumenService } from '../resumen/resumen.service';
import { segundosDesde } from './dedup';
import { admiteEquipoRival, esTipoDeEvento } from './evento.tipos';
import { EventosService, type SolicitudEvento } from './eventos.service';
import {
  type GanchosPostPartido,
  pasoGoleadoresPost,
  pasoTarjetasPost,
} from './post-partido.flujo';
import {
  avisoDeDuplicado,
  botonesDeOrigen,
  ID_DESHACER,
  ID_ES_OTRO,
  ID_FINALIZAR_PARTIDO,
  ID_FINALIZAR_TIEMPO,
  ID_JUGADOR_OTRO,
  ID_JUGADOR_SIN_IDENTIFICAR,
  ID_NO,
  ID_RESUMEN,
  ID_SI,
  ID_YA_ESTABA,
  lineaDeBitacora,
  origenDesdeBoton,
  panelEnVivo,
  PREFIJO_EVENTO,
  PREFIJO_JUGADOR,
  recortar,
} from './mensajes';

export const FLUJO_CARGAR = 'cargar';

/** A qué vino el usuario: el mismo flujo atiende /cargar, /finalizar y /deshacer. */
export type DestinoCarga = 'cargar' | 'finalizar' | 'deshacer';
export const CLAVE_DESTINO = 'destino';

const PASOS = {
  equipo: 'equipo',
  partido: 'partido',
  modo: 'modo',
  panel: 'panel',
  origen: 'origen',
  jugador: 'jugador',
  jugadorLibre: 'jugador-libre',
  duplicado: 'duplicado',
  finTiempo: 'fin-tiempo',
  finPartido: 'fin-partido',
  goleadoresPost: 'goleadores-post',
  tarjetasPost: 'tarjetas-post',
} as const;

const CLAVE_PARTIDO_ID = 'partidoId';
const CLAVE_PANEL = 'panelId';
const CLAVE_TIPO = 'tipoEvento';
const CLAVE_ORIGEN = 'origenEvento';
const CLAVE_JUGADOR_PENDIENTE = 'jugadorPendiente';
/** El "➕ ... quedó agregado a la plantilla" que un alta deja pendiente de
 * mostrar si el evento resulta un posible duplicado. */
const CLAVE_NOTA_PENDIENTE = 'notaPendiente';
const CLAVE_PAGINA = 'paginaJugadores';
/** Nota efímera que el panel muestra una vez y descarta. */
const CLAVE_AVISO = 'aviso';
/** Líneas de bitácora todavía sin enviar, en camino al panel. */
const CLAVE_BITACORA = 'bitacora';

const PREFIJO_PARTIDO = 'pt:';
const ID_MODO_VIVO = 'md:vivo';
const ID_MODO_POST = 'md:post';
const ID_POST_CORREGIR = 'pp:corregir';
const ID_POST_LISTO = 'pp:listo';

/** Lo que el panel tiene que contar cuando se vuelve a él desde un sub-paso. */
interface Novedad {
  aviso?: string;
  bitacora?: string[];
}

const BOTONES_MODO = [
  { id: ID_MODO_VIVO, texto: '🔴 En vivo' },
  { id: ID_MODO_POST, texto: '📝 Post partido' },
];

const BOTONES_POST_REENTRADA = [
  { id: ID_POST_CORREGIR, texto: 'Corregir todo' },
  { id: ID_POST_LISTO, texto: 'Nada más' },
];

/**
 * Carga de eventos durante el partido (§4 y §5 del flujo).
 *
 * Todo pasa por un solo mensaje que se edita en el sitio: el panel. Los
 * sub-pasos —de qué equipo, quién, confirmaciones— reemplazan ese mismo
 * mensaje y vuelven al panel al terminar, así que el chat no se llena de
 * preguntas viejas. Lo que sí queda en el chat es la bitácora: una línea por
 * evento, que es lo que un papá reenvía al grupo sin esperar al resumen.
 */
@Injectable()
export class CargarFlujo {
  constructor(
    private readonly partidos: PartidosService,
    private readonly tiempos: TiemposService,
    private readonly eventos: EventosService,
    private readonly jugadores: JugadoresService,
    private readonly membresias: MembresiasService,
    private readonly resumen: ResumenService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_CARGAR,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.partido,
          rolMinimo: 'editor',
          pregunta: '¿De qué equipo?',
        }),
        this.pasoPartido(),
        this.pasoModo(),
        this.pasoPanel(),
        this.pasoOrigen(),
        this.pasoJugador(),
        this.pasoJugadorLibre(),
        this.pasoDuplicado(),
        this.pasoFinTiempo(),
        this.pasoFinPartido(),
        pasoGoleadoresPost(
          PASOS.goleadoresPost,
          PASOS.tarjetasPost,
          this.jugadores,
          this.eventos,
          this.ganchosPostPartido(),
        ),
        pasoTarjetasPost(
          PASOS.tarjetasPost,
          PASOS.finPartido,
          this.jugadores,
          this.eventos,
          this.ganchosPostPartido(),
        ),
      ],
    };
  }

  // --- Elegir el partido ------------------------------------------------

  private pasoPartido(): Paso {
    const botones = (abiertos: Partido[]) =>
      abiertos.map((p) => ({
        id: `${PREFIJO_PARTIDO}${p.id}`,
        texto: recortar(`${recortar(p.rival, 12)} · ${describirFecha(p.fecha)}`, 20),
      }));

    return {
      id: PASOS.partido,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const abiertos = await this.partidos.abiertosDe(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));

        if (abiertos.length === 0) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: {
                texto: 'Este equipo no tiene partidos abiertos. Crea uno con /nuevopartido.',
              },
            },
          };
        }

        // Con un solo partido abierto no hay nada que elegir, y un domingo ese
        // es el caso normal.
        if (abiertos.length === 1) {
          return { transicion: this.trasElegirPartido(ctx, abiertos[0]) };
        }

        return { respuesta: { texto: '¿A qué partido?', botones: botones(abiertos) } };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const abiertos = await this.partidos.abiertosDe(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const seleccion = ctx.mensaje.seleccionId ?? '';
        const elegido = abiertos.find((p) => `${PREFIJO_PARTIDO}${p.id}` === seleccion);

        if (!elegido) {
          return {
            tipo: 'repetir',
            respuesta: { texto: 'Toca uno de los partidos:', botones: botones(abiertos) },
          };
        }

        return this.trasElegirPartido(ctx, elegido);
      },
    };
  }

  /** Cada comando entra por el mismo camino y sale hacia un paso distinto. */
  private trasElegirPartido(ctx: ContextoFlujo, partido: Partido): Transicion {
    const datos: DatosFlujo = {
      [CLAVE_PARTIDO_ID]: partido.id,
      [CLAVE_PANEL]: this.panelId(ctx),
    };

    switch (this.destino(ctx)) {
      case 'finalizar':
        return { tipo: 'ir', pasoId: PASOS.finPartido, datos };
      case 'deshacer':
        return { tipo: 'ir', pasoId: PASOS.panel, datos };
      default:
        return { tipo: 'ir', pasoId: PASOS.modo, datos };
    }
  }

  // --- Bifurcación por modo (§4) ----------------------------------------

  private pasoModo(): Paso {
    const preguntarModo = (): RespuestaBot => ({
      texto: '¿Vas a cargar en vivo o ya terminó el partido?',
      botones: BOTONES_MODO,
    });

    // 4c: reentrada a un partido ya cargado como post partido (RF-4.2). Se
    // muestra el resumen actual antes de dejar tocar nada: así no se pisa
    // por accidente algo que ya se cargó bien.
    const preguntarReentrada = async (
      ctx: ContextoFlujo,
      partido: Partido,
    ): Promise<RespuestaBot> => {
      const resumen = await this.resumen.generar(
        partido,
        leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo'),
      );

      return {
        texto: [
          resumen,
          '',
          '¿Agregas o corriges algo? "Corregir todo" empieza de nuevo: goleadores y tarjetas.',
        ].join('\n'),
        botones: BOTONES_POST_REENTRADA,
      };
    };

    return {
      id: PASOS.modo,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const partido = await this.partidoDe(ctx);

        if (!partido) return { transicion: this.partidoPerdido() };

        // 4d: cerrado.
        if (partido.estado === 'cerrado') {
          return { transicion: this.finalizarCon(this.textoPartidoCerrado()) };
        }

        if (partido.modoCarga === 'post_partido') {
          return { respuesta: await preguntarReentrada(ctx, partido) };
        }

        // 4b: ya está en vivo; no se vuelve a preguntar.
        if (partido.modoCarga === 'en_vivo') {
          return { transicion: this.irAlPanel(ctx, { aviso: await this.avisoEnCurso(partido) }) };
        }

        // 4a: sin modo definido.
        return { respuesta: preguntarModo() };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const partido = await this.partidoDe(ctx);

        if (!partido) return this.partidoPerdido();

        if (partido.estado === 'cerrado') {
          return this.finalizarCon(this.textoPartidoCerrado());
        }

        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (partido.modoCarga === 'post_partido') {
          if (seleccion === ID_POST_LISTO) return this.finalizarCon('Listo, no cambié nada.');

          if (seleccion !== ID_POST_CORREGIR) {
            return { tipo: 'repetir', respuesta: await preguntarReentrada(ctx, partido) };
          }

          if (!(await this.siguePudiendoCargar(ctx))) return this.sinPermiso();

          await this.eventos.borrarEventosPostPartido(partido.id, ctx.usuarioId ?? '');

          return { tipo: 'ir', pasoId: PASOS.goleadoresPost, datos: this.datosPanel(ctx) };
        }

        if (seleccion === ID_MODO_POST) {
          if (!(await this.siguePudiendoCargar(ctx))) return this.sinPermiso();

          const inicio = await this.tiempos.iniciarPostPartido(partido.id, ctx.usuarioId ?? '');

          if (inicio.tipo === 'no_existe') return this.partidoPerdido();

          if (inicio.tipo === 'cerrado' || inicio.tipo === 'ya_tiene_modo') {
            return this.finalizarCon(
              'Alguien cambió el partido mientras decidías; vuelve a intentar con /cargar.',
            );
          }

          return { tipo: 'ir', pasoId: PASOS.goleadoresPost, datos: this.datosPanel(ctx) };
        }

        if (seleccion !== ID_MODO_VIVO) {
          return { tipo: 'repetir', respuesta: preguntarModo() };
        }

        const inicio = await this.tiempos.iniciarEnVivo(partido.id, ctx.usuarioId ?? '');

        if (inicio.tipo === 'no_existe') return this.partidoPerdido();

        if (inicio.tipo === 'cerrado') {
          return this.finalizarCon(
            'Alguien cerró el partido mientras decidías; ya no se puede cargar.',
          );
        }

        const aviso =
          inicio.tipo === 'iniciado'
            ? '▶️ Arrancó el Tiempo 1.'
            : await this.avisoEnCurso(inicio.partido);

        return this.irAlPanel(ctx, { aviso });
      },
    };
  }

  private async avisoEnCurso(partido: Partido): Promise<string> {
    const quien = await this.partidos.nombreDe(partido.iniciadoPor);

    return quien
      ? `Este partido ya está en vivo (lo inició ${quien}).`
      : 'Este partido ya está en vivo.';
  }

  // --- Panel de carga (§5) ----------------------------------------------

  private pasoPanel(): Paso {
    return {
      id: PASOS.panel,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        // `/deshacer` entra directo acá: deshace y muestra el panel resultante.
        // Se limpia el destino para que volver al panel no lo repita.
        if (this.destino(ctx) === 'deshacer') {
          ctx.datos[CLAVE_DESTINO] = 'cargar';

          const resultado = await this.deshacer(ctx);

          if ('fin' in resultado) return { transicion: resultado.fin };

          this.acumular(ctx, resultado);
        }

        const respuesta = await this.dibujarPanel(ctx);

        return respuesta ? { respuesta } : { transicion: this.partidoPerdido() };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (seleccion.startsWith(PREFIJO_EVENTO)) {
          return this.arrancarEvento(ctx, seleccion.slice(PREFIJO_EVENTO.length));
        }

        if (seleccion === ID_FINALIZAR_TIEMPO) {
          return { tipo: 'ir', pasoId: PASOS.finTiempo, datos: this.datosPanel(ctx) };
        }

        if (seleccion === ID_FINALIZAR_PARTIDO) {
          return { tipo: 'ir', pasoId: PASOS.finPartido, datos: this.datosPanel(ctx) };
        }

        if (seleccion === ID_DESHACER) {
          const resultado = await this.deshacer(ctx);

          return 'fin' in resultado ? resultado.fin : this.irAlPanel(ctx, resultado);
        }

        if (seleccion === ID_RESUMEN) {
          return this.irAlPanel(ctx, { bitacora: [await this.textoResumen(ctx)] });
        }

        return this.irAlPanel(ctx, {});
      },
    };
  }

  /** Toca un botón de evento: asegura que haya reloj y pregunta lo que falte. */
  private async arrancarEvento(ctx: ContextoFlujo, crudo: string): Promise<Transicion> {
    if (!esTipoDeEvento(crudo)) return this.irAlPanel(ctx, {});

    // Puede arrancar el reloj (RF-3.8), así que revalida antes de escribir.
    if (!(await this.siguePudiendoCargar(ctx))) return this.sinPermiso();

    const resultado = await this.tiempos.asegurarTiempoEnCurso(
      leerTexto(ctx.datos, CLAVE_PARTIDO_ID),
      ctx.usuarioId ?? '',
    );

    if (resultado.tipo === 'no_existe') return this.partidoPerdido();

    if (resultado.tipo === 'cerrado') {
      return this.finalizarCon(
        'El partido se cerró mientras cargabas. Pídele a un admin /reabrir.',
      );
    }

    // RF-3.8: durante un partido nadie se acuerda de tocar "Iniciar Tiempo 2"
    // antes de cargar el gol que acaba de pasar.
    const aviso =
      resultado.tipo === 'en_curso' && resultado.recienIniciado
        ? `▶️ Se inició el Tiempo ${resultado.partido.tiempoActual} automáticamente.`
        : '';

    const datos: DatosFlujo = {
      ...this.datosPanel(ctx),
      [CLAVE_TIPO]: crudo,
      [CLAVE_AVISO]: aviso,
      [CLAVE_PAGINA]: 0,
    };

    if (admiteEquipoRival(crudo)) {
      return { tipo: 'ir', pasoId: PASOS.origen, datos };
    }

    return { tipo: 'ir', pasoId: PASOS.jugador, datos: { ...datos, [CLAVE_ORIGEN]: 'propio' } };
  }

  // --- ¿De qué equipo? --------------------------------------------------

  private pasoOrigen(): Paso {
    const pregunta = (ctx: ContextoFlujo, partido: Partido): RespuestaBot => ({
      texto: this.conAviso(ctx, '¿De qué equipo?'),
      botones: botonesDeOrigen(
        leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Nosotros'),
        partido.rival,
      ),
      editarMensajeId: this.panelId(ctx),
    });

    return {
      id: PASOS.origen,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const partido = await this.partidoDe(ctx);

        return partido
          ? { respuesta: pregunta(ctx, partido) }
          : { transicion: this.partidoPerdido() };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const partido = await this.partidoDe(ctx);

        if (!partido) return this.partidoPerdido();

        const origen = origenDesdeBoton(ctx.mensaje.seleccionId ?? '');

        if (!origen) return { tipo: 'repetir', respuesta: pregunta(ctx, partido) };

        // El rival no tiene plantilla cargada: no hay a quién elegir.
        if (origen === 'rival') {
          return this.registrar(ctx, { equipoOrigen: 'rival', jugadorId: null });
        }

        return {
          tipo: 'ir',
          pasoId: PASOS.jugador,
          datos: { ...this.datosPanel(ctx), [CLAVE_ORIGEN]: 'propio' },
        };
      },
    };
  }

  // --- ¿Quién? ----------------------------------------------------------

  private pasoJugador(): Paso {
    // Un gol sin ficha se registra igual, porque si no el marcador no cuadra.
    // Una tarjeta sin jugador no le suma a nadie y solo ensucia el historial.
    const admiteSinFicha = (ctx: ContextoFlujo): boolean => {
      const tipo = leerTexto(ctx.datos, CLAVE_TIPO);

      return esTipoDeEvento(tipo) && admiteEquipoRival(tipo);
    };

    // Los botones que este paso agrega aparte de la plantilla, y que hay que
    // descontar del tamaño de página para no pasarse del límite del canal.
    const extras = (ctx: ContextoFlujo) => (admiteSinFicha(ctx) ? 2 : 1);

    const preguntar = async (ctx: ContextoFlujo, pagina: number): Promise<RespuestaBot> => {
      const plantilla = await this.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
      const { botones } = botonesPaginados(
        plantilla.map((j) => ({ id: `${PREFIJO_JUGADOR}${j.id}`, texto: describirJugador(j) })),
        pagina,
        extras(ctx),
      );

      botones.push({ id: ID_JUGADOR_OTRO, texto: 'Otro jugador' });

      if (admiteSinFicha(ctx)) {
        botones.push({ id: ID_JUGADOR_SIN_IDENTIFICAR, texto: 'Sin identificar' });
      }

      return {
        texto: this.conAviso(ctx, '¿Quién?'),
        botones,
        editarMensajeId: this.panelId(ctx),
      };
    };

    return {
      id: PASOS.jugador,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => ({
        respuesta: await preguntar(ctx, leerNumero(ctx.datos, CLAVE_PAGINA, 0)),
      }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';
        const pagina = leerNumero(ctx.datos, CLAVE_PAGINA, 0);

        if (seleccion === ID_VER_MAS) {
          const plantilla = await this.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
          const siguiente = paginaSiguiente(pagina, plantilla.length, extras(ctx));

          ctx.datos[CLAVE_PAGINA] = siguiente;
          ctx.datos[CLAVE_AVISO] = '';

          return { tipo: 'repetir', respuesta: await preguntar(ctx, siguiente) };
        }

        if (seleccion === ID_JUGADOR_OTRO) {
          return { tipo: 'ir', pasoId: PASOS.jugadorLibre, datos: this.datosPanel(ctx) };
        }

        if (seleccion === ID_JUGADOR_SIN_IDENTIFICAR) {
          return this.registrar(ctx, { jugadorId: null });
        }

        if (seleccion.startsWith(PREFIJO_JUGADOR)) {
          return this.registrar(ctx, { jugadorId: seleccion.slice(PREFIJO_JUGADOR.length) });
        }

        // Escribir el nombre también sirve, y es más rápido que buscarlo entre
        // veinte botones.
        const escrito = ctx.mensaje.texto?.trim();

        if (escrito) return this.resolverPorNombre(ctx, escrito);

        return { tipo: 'repetir', respuesta: await preguntar(ctx, pagina) };
      },
    };
  }

  private pasoJugadorLibre(): Paso {
    return {
      id: PASOS.jugadorLibre,

      entrar: (ctx: ContextoFlujo) =>
        Promise.resolve({
          respuesta: {
            texto: 'Escribe el nombre (y el dorsal si quieres): Jacob, 10',
            editarMensajeId: this.panelId(ctx),
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const escrito = ctx.mensaje.texto?.trim();

        if (!escrito) return { tipo: 'repetir', respuesta: { texto: 'Necesito un nombre.' } };

        return this.resolverPorNombre(ctx, escrito);
      },
    };
  }

  /**
   * Busca al jugador por nombre y, si no está en la plantilla, lo da de alta.
   *
   * Es lo que hace falta al borde de la cancha: aparece un chico que nadie
   * cargó y el gol no puede esperar a que alguien edite la plantilla. Se busca
   * también entre los inactivos, para no crear un duplicado de alguien que
   * estaba dado de baja.
   */
  private async resolverPorNombre(ctx: ContextoFlujo, texto: string): Promise<Transicion> {
    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
    const parseado = parsearJugador(texto);

    if (!parseado) {
      return {
        tipo: 'repetir',
        respuesta: { texto: 'No entendí el nombre. Escríbelo así: Jacob, 10' },
      };
    }

    const { jugador, creado } = await this.jugadores.resolverOCrear(equipoId, parseado);

    return this.registrar(ctx, {
      jugadorId: jugador.id,
      nota: creado ? `➕ ${describirJugador(jugador)} quedó agregado a la plantilla.` : undefined,
    });
  }

  // --- Registro y duplicados --------------------------------------------

  private async registrar(
    ctx: ContextoFlujo,
    opciones: {
      jugadorId: string | null;
      equipoOrigen?: 'propio' | 'rival';
      forzar?: boolean;
      nota?: string;
    },
  ): Promise<Transicion> {
    if (!(await this.siguePudiendoCargar(ctx))) return this.sinPermiso();

    const tipo = leerTexto(ctx.datos, CLAVE_TIPO);

    if (!esTipoDeEvento(tipo)) return this.irAlPanel(ctx, {});

    const equipoOrigen =
      opciones.equipoOrigen ??
      (leerTexto(ctx.datos, CLAVE_ORIGEN) === 'rival' ? 'rival' : 'propio');

    const solicitud: SolicitudEvento = {
      partidoId: leerTexto(ctx.datos, CLAVE_PARTIDO_ID),
      tipo,
      equipoOrigen,
      jugadorId: opciones.jugadorId,
      reportadoPor: ctx.usuarioId ?? '',
      forzar: opciones.forzar,
    };

    const resultado = await this.eventos.registrar(solicitud);

    if (resultado.tipo === 'no_existe') return this.partidoPerdido();

    if (resultado.tipo === 'partido_cerrado') {
      return this.finalizarCon('El partido se cerró mientras cargabas; no guardé el evento.');
    }

    const equipoNombre = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Nosotros');

    if (resultado.tipo === 'posible_duplicado') {
      const partido = await this.partidoDe(ctx);

      return {
        tipo: 'ir',
        pasoId: PASOS.duplicado,
        datos: {
          ...this.datosPanel(ctx),
          [CLAVE_ORIGEN]: equipoOrigen,
          [CLAVE_JUGADOR_PENDIENTE]: opciones.jugadorId ?? '',
          [CLAVE_NOTA_PENDIENTE]: opciones.nota ?? '',
          [CLAVE_AVISO]: avisoDeDuplicado(
            resultado.reciente,
            segundosDesde(resultado.reciente.creadoEn),
            equipoNombre,
            partido?.rival ?? 'el rival',
          ),
        },
      };
    }

    const linea = lineaDeBitacora(
      resultado.evento,
      resultado.marcador,
      equipoNombre,
      resultado.partido.rival,
    );

    return this.irAlPanel(ctx, {
      aviso: '',
      bitacora: [opciones.nota ? `${linea}\n${opciones.nota}` : linea],
    });
  }

  private pasoDuplicado(): Paso {
    const preguntar = (ctx: ContextoFlujo): RespuestaBot => ({
      texto: leerTexto(ctx.datos, CLAVE_AVISO),
      botones: [
        { id: ID_ES_OTRO, texto: 'Es otro' },
        { id: ID_YA_ESTABA, texto: 'Ya estaba' },
      ],
      editarMensajeId: this.panelId(ctx),
    });

    return {
      id: PASOS.duplicado,

      entrar: (ctx: ContextoFlujo) => Promise.resolve({ respuesta: preguntar(ctx) }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        // El alta pendiente (si la hubo) ya pasó, dupliquen o no: si no se
        // avisa acá, el jugador queda en la plantilla sin que nadie se entere.
        const nota = leerTexto(ctx.datos, CLAVE_NOTA_PENDIENTE);

        if (seleccion === ID_YA_ESTABA) {
          const linea = nota ? `Listo, no lo dupliqué.\n${nota}` : 'Listo, no lo dupliqué.';

          return this.irAlPanel(ctx, { aviso: '', bitacora: [linea] });
        }

        if (seleccion !== ID_ES_OTRO) {
          return { tipo: 'repetir', respuesta: preguntar(ctx) };
        }

        const pendiente = leerTexto(ctx.datos, CLAVE_JUGADOR_PENDIENTE);

        return this.registrar(ctx, {
          jugadorId: pendiente || null,
          forzar: true,
          nota: nota || undefined,
        });
      },
    };
  }

  // --- Tiempos ----------------------------------------------------------

  private pasoFinTiempo(): Paso {
    const preguntar = async (ctx: ContextoFlujo): Promise<RespuestaBot | null> => {
      const partido = await this.partidoDe(ctx);

      if (!partido) return null;

      const contexto = await this.tiempos.contextoDeCarga(partido);

      return {
        texto:
          partido.tiempoEstado === 'en_curso'
            ? `¿Confirmas que finalizó el Tiempo ${partido.tiempoActual}? (min ${describirMinuto(contexto.minuto)})`
            : `¿Arrancamos el Tiempo ${partido.tiempoActual + 1}?`,
        botones: [
          { id: ID_SI, texto: 'Sí' },
          { id: ID_NO, texto: 'Todavía no' },
        ],
        editarMensajeId: this.panelId(ctx),
      };
    };

    return {
      id: PASOS.finTiempo,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const respuesta = await preguntar(ctx);

        return respuesta ? { respuesta } : { transicion: this.partidoPerdido() };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (seleccion === ID_NO) return this.irAlPanel(ctx, { aviso: '' });

        if (seleccion !== ID_SI) {
          const respuesta = await preguntar(ctx);

          return respuesta ? { tipo: 'repetir', respuesta } : this.partidoPerdido();
        }

        if (!(await this.siguePudiendoCargar(ctx))) return this.sinPermiso();

        const partido = await this.partidoDe(ctx);

        if (!partido) return this.partidoPerdido();

        const usuarioId = ctx.usuarioId ?? '';
        const partidoId = leerTexto(ctx.datos, CLAVE_PARTIDO_ID);

        // Con el tiempo ya finalizado, "Sí" significa arrancar el siguiente.
        if (partido.tiempoEstado !== 'en_curso') {
          const inicio = await this.tiempos.asegurarTiempoEnCurso(partidoId, usuarioId);

          // `cerrado` y `no_existe` no son "no quedan tiempos": otro padre
          // cerró el partido (o lo borró) mientras este miraba el prompt de
          // "¿Arrancamos el Tiempo 2?", y redibujar el panel sobre eso sería
          // un motivo falso encima de un partido que ya no admite carga.
          if (inicio.tipo === 'no_existe') return this.partidoPerdido();

          if (inicio.tipo === 'cerrado') {
            return this.finalizarCon(
              'El partido se cerró mientras cargabas. Pídele a un admin /reabrir.',
            );
          }

          const aviso =
            inicio.tipo === 'sin_tiempos'
              ? 'No quedan tiempos por jugar.'
              : inicio.recienIniciado
                ? `▶️ Arrancó el Tiempo ${inicio.partido.tiempoActual}.`
                : `El Tiempo ${inicio.partido.tiempoActual} ya lo arrancó otra persona.`;

          return this.irAlPanel(ctx, { aviso });
        }

        const fin = await this.tiempos.finalizarTiempo(partidoId, usuarioId);

        if (fin.tipo === 'no_existe') return this.partidoPerdido();

        return this.irAlPanel(ctx, { aviso: this.avisoDeFinDeTiempo(fin) });
      },
    };
  }

  private avisoDeFinDeTiempo(fin: ResultadoFinTiempo): string {
    switch (fin.tipo) {
      case 'finalizado':
        return fin.esUltimo
          ? `⏸️ Tiempo ${fin.numero} finalizado (era el último).`
          : `⏸️ Tiempo ${fin.numero} finalizado.`;
      case 'ya_finalizado':
        // El lock del servicio ya decidió la carrera; acá solo se cuenta el
        // desenlace, en vez de fingir que se finalizó dos veces.
        return fin.porQuien
          ? `Ese tiempo ya lo finalizó ${fin.porQuien}.`
          : 'Ese tiempo ya estaba finalizado.';
      case 'no_iniciado':
        return 'El partido todavía no arrancó.';
      default:
        return 'El partido ya está cerrado.';
    }
  }

  // --- Cierre del partido (§6) ------------------------------------------

  private pasoFinPartido(): Paso {
    const preguntar = async (ctx: ContextoFlujo): Promise<RespuestaBot | null> => {
      const partido = await this.partidoDe(ctx);

      if (!partido) return null;

      return {
        texto: [
          `¿Confirmas el marcador final? ${partido.marcadorPropio}-${partido.marcadorRival}`,
          '',
          'Si no cuadra, escríbelo tal cual: 3-1',
        ].join('\n'),
        botones: [
          { id: ID_SI, texto: 'Sí, finalizar' },
          { id: ID_NO, texto: 'No, falta algo' },
        ],
        editarMensajeId: this.panelId(ctx),
      };
    };

    return {
      id: PASOS.finPartido,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const partido = await this.partidoDe(ctx);

        if (!partido) return { transicion: this.partidoPerdido() };

        if (partido.estado === 'cerrado') {
          return { transicion: this.finalizarCon(this.textoPartidoCerrado()) };
        }

        const respuesta = await preguntar(ctx);

        return respuesta ? { respuesta } : { transicion: this.partidoPerdido() };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (seleccion === ID_NO) {
          return this.destino(ctx) === 'finalizar'
            ? this.finalizarCon('Listo, no cerré nada.')
            : this.irAlPanel(ctx, { aviso: '' });
        }

        const partido = await this.partidoDe(ctx);

        if (!partido) return this.partidoPerdido();

        // Escribir "3-1" corrige el marcador y confirma en un solo paso: es lo
        // que ofrece el mensaje, así que tiene que funcionar.
        const escrito = parsearMarcador(ctx.mensaje.texto);

        if (seleccion !== ID_SI && !escrito) {
          const respuesta = await preguntar(ctx);

          return respuesta ? { tipo: 'repetir', respuesta } : this.partidoPerdido();
        }

        if (!(await this.siguePudiendoCargar(ctx))) return this.sinPermiso();

        const marcador = escrito ?? {
          propio: partido.marcadorPropio,
          rival: partido.marcadorRival,
        };

        const cierre = await this.partidos.cerrar(partido.id, ctx.usuarioId ?? '', marcador);

        if (cierre.tipo === 'no_existe') return this.partidoPerdido();

        if (cierre.tipo === 'ya_cerrado') {
          return this.finalizarCon(
            cierre.porQuien
              ? `${cierre.porQuien} ya lo había cerrado. Dejé su marcador: ${describirMarcador(cierre.partido)}.`
              : 'El partido ya estaba cerrado.',
          );
        }

        const resumen = await this.resumen.generar(
          cierre.partido,
          leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo'),
        );

        return {
          tipo: 'finalizar',
          respuesta: {
            texto: 'Partido cerrado ✅',
            editarMensajeId: this.panelId(ctx),
            adicionales: [{ texto: resumen }],
          },
        };
      },
    };
  }

  // --- Deshacer ---------------------------------------------------------

  private async deshacer(ctx: ContextoFlujo): Promise<Novedad | { fin: Transicion }> {
    if (!(await this.siguePudiendoCargar(ctx))) return { fin: this.sinPermiso() };

    const partidoId = leerTexto(ctx.datos, CLAVE_PARTIDO_ID);
    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
    const usuarioId = ctx.usuarioId ?? '';
    const esAdmin = await this.membresias.puede(usuarioId, equipoId, 'admin');

    const resultado = await this.eventos.deshacerUltimo(partidoId, usuarioId, esAdmin);

    switch (resultado.tipo) {
      case 'deshecho': {
        const partido = await this.partidoDe(ctx);
        const linea = lineaDeBitacora(
          resultado.evento,
          resultado.marcador,
          leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Nosotros'),
          partido?.rival ?? 'el rival',
        );

        return { aviso: '', bitacora: [`↩️ Se eliminó: ${linea}`] };
      }
      case 'ajeno':
        return {
          aviso: `El último evento lo cargó ${resultado.evento.reportanteNombre ?? 'otra persona'}; solo un admin puede deshacerlo.`,
        };
      case 'sin_eventos':
        return { aviso: 'No hay eventos para deshacer.' };
      case 'partido_cerrado':
        return { fin: this.finalizarCon(this.textoPartidoCerrado()) };
      default:
        return { fin: this.partidoPerdido() };
    }
  }

  // --- Utilidades del panel ---------------------------------------------

  /**
   * Dibuja el panel con lo que haya quedado pendiente de contar.
   *
   * El aviso y la bitácora se consumen acá: son de un solo uso, y dejarlos en
   * los datos haría que el próximo toque volviera a anunciar un gol de hace
   * diez minutos.
   */
  private async dibujarPanel(ctx: ContextoFlujo): Promise<RespuestaBot | null> {
    const partido = await this.partidoDe(ctx);

    if (!partido) return null;

    const aviso = leerTexto(ctx.datos, CLAVE_AVISO);
    const bitacora = leerLista(ctx.datos, CLAVE_BITACORA);

    ctx.datos[CLAVE_AVISO] = '';
    ctx.datos[CLAVE_BITACORA] = [];
    ctx.datos[CLAVE_PANEL] = this.panelId(ctx);

    const contexto = await this.tiempos.contextoDeCarga(partido);
    const panel = panelEnVivo({
      partido,
      equipoNombre: leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo'),
      minuto: contexto.minuto,
      aviso: aviso || undefined,
    });

    const adicionales: MensajeAdicional[] = bitacora.map((texto) => ({ texto }));

    return {
      ...panel,
      editarMensajeId: this.panelId(ctx),
      ...(adicionales.length > 0 ? { adicionales } : {}),
    };
  }

  /**
   * Vuelve al panel desde un sub-paso.
   *
   * Es `ir` y no `repetir`: si se repitiera el sub-paso, el próximo toque
   * volvería a caer en la confirmación que el usuario acaba de responder.
   */
  private irAlPanel(ctx: ContextoFlujo, novedad: Novedad): Transicion {
    return {
      tipo: 'ir',
      pasoId: PASOS.panel,
      datos: {
        ...this.datosPanel(ctx),
        [CLAVE_AVISO]: novedad.aviso ?? leerTexto(ctx.datos, CLAVE_AVISO),
        [CLAVE_BITACORA]: [...leerLista(ctx.datos, CLAVE_BITACORA), ...(novedad.bitacora ?? [])],
      },
    };
  }

  /** Suma una novedad a los datos, para cuando ya estamos dentro del paso. */
  private acumular(ctx: ContextoFlujo, novedad: Novedad): void {
    if (novedad.aviso !== undefined) ctx.datos[CLAVE_AVISO] = novedad.aviso;

    ctx.datos[CLAVE_BITACORA] = [
      ...leerLista(ctx.datos, CLAVE_BITACORA),
      ...(novedad.bitacora ?? []),
    ];
  }

  private datosPanel(ctx: ContextoFlujo): DatosFlujo {
    return { [CLAVE_PANEL]: this.panelId(ctx) };
  }

  private conAviso(ctx: ContextoFlujo, texto: string): string {
    return [leerTexto(ctx.datos, CLAVE_AVISO), texto].filter(Boolean).join('\n');
  }

  private async partidoDe(ctx: ContextoFlujo): Promise<Partido | null> {
    return this.partidos.obtener(leerTexto(ctx.datos, CLAVE_PARTIDO_ID));
  }

  private async textoResumen(ctx: ContextoFlujo): Promise<string> {
    const partido = await this.partidoDe(ctx);

    if (!partido) return 'No encontré el partido.';

    return this.resumen.generar(partido, leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo'));
  }

  /**
   * Revalida el rol antes de escribir (RF-7.2).
   *
   * `pasoSelectorEquipo` valida `rolMinimo: 'editor'` una sola vez, al entrar
   * al flujo, y la sesión dura una hora: sin esto, a un editor que un admin
   * saca del equipo a mitad de partido el panel le sigue vivo y puede seguir
   * cargando eventos, deshaciendo o hasta cerrando el partido durante todo ese
   * tiempo. Los flujos hermanos (nuevo-partido, reabrir) revalidan igual antes
   * de escribir.
   */
  private async siguePudiendoCargar(ctx: ContextoFlujo): Promise<boolean> {
    if (!ctx.usuarioId) return false;

    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);

    return this.membresias.puede(ctx.usuarioId, equipoId, 'editor');
  }

  /** Lo que `post-partido.flujo.ts` necesita prestado de acá. */
  private ganchosPostPartido(): GanchosPostPartido {
    return {
      panelId: (ctx) => this.panelId(ctx),
      datosPanel: (ctx) => this.datosPanel(ctx),
      partidoId: (ctx) => leerTexto(ctx.datos, CLAVE_PARTIDO_ID),
      siguePudiendoCargar: (ctx) => this.siguePudiendoCargar(ctx),
      sinPermiso: () => this.sinPermiso(),
      partidoPerdido: () => this.partidoPerdido(),
    };
  }

  private sinPermiso(): Transicion {
    return this.finalizarCon(
      'Ya no tienes permiso de carga en ese equipo, así que no guardé nada.',
    );
  }

  private textoPartidoCerrado(): string {
    return 'Ese partido ya está cerrado. Si hay que corregir algo, un admin puede reabrirlo con /reabrir.';
  }

  private finalizarCon(texto: string): Transicion {
    return { tipo: 'finalizar', respuesta: { texto } };
  }

  private partidoPerdido(): Transicion {
    return this.finalizarCon('No encontré ese partido. Vuelve a empezar con /cargar.');
  }

  /**
   * El mensaje que hay que editar para actualizar el panel.
   *
   * `mensajeOrigenId` trae el id del mensaje que llevaba el botón, y mientras
   * se navegue con los botones del panel es el mismo mensaje que ya viene
   * guardado en `CLAVE_PANEL`: cada respuesta lo edita a sí mismo, así que su
   * propio callback siempre apunta a él. Por eso el panel guardado manda, y
   * `mensajeOrigenId` es solo el respaldo para la primera vez que todavía no
   * hay nada guardado (o para un mensaje escrito, que no lo trae).
   *
   * Con dos partidos abiertos, la lista para elegir partido queda publicada
   * y nunca se edita; tocar uno de sus botones viejos después de que el panel
   * ya vive en otro mensaje traería el id de esa lista, no el del panel real.
   * Confiar en ese `mensajeOrigenId` ahí pisaría el panel de otro partido.
   */
  private panelId(ctx: ContextoFlujo): string | undefined {
    // `undefined` y no cadena vacía: `editarMensajeId: ''` viajaría hasta el
    // adaptador como un id que no existe.
    return leerTexto(ctx.datos, CLAVE_PANEL) || ctx.mensaje.mensajeOrigenId || undefined;
  }

  private destino(ctx: ContextoFlujo): DestinoCarga {
    const valor = leerTexto(ctx.datos, CLAVE_DESTINO, 'cargar');

    return valor === 'finalizar' || valor === 'deshacer' ? valor : 'cargar';
  }
}

/** "3-1", "3 a 1", "3:1". Solo si hay exactamente dos números. */
export function parsearMarcador(texto?: string): { propio: number; rival: number } | null {
  const numeros = texto?.match(/\d+/g);

  if (!numeros || numeros.length !== 2) return null;

  const propio = Number(numeros[0]);
  const rival = Number(numeros[1]);

  return propio > 99 || rival > 99 ? null : { propio, rival };
}

function leerLista(datos: DatosFlujo, clave: string): string[] {
  const valor = datos[clave];

  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}
