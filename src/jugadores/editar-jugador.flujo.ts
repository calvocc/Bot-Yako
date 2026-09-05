import { Injectable } from '@nestjs/common';
import type { Boton, RespuestaBot } from '../channels/channel.types';
import {
  botonesPaginados,
  ID_VER_MAS,
  paginaSiguiente,
} from '../conversacion/pasos-comunes/paginacion';
import { CLAVE_EQUIPO_ID, pasoSelectorEquipo } from '../conversacion/pasos-comunes/selector-equipo';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import { MembresiasService } from '../identidad/membresias.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/jugadores';
import { parsearEstatura, parsearFechaNacimiento, parsearPeso } from './datos-fisicos';
import { describirJugador, JugadoresService, type Jugador } from './jugadores.service';
import { esPosicion, ETIQUETA_POSICION, POSICIONES } from './posicion';

export const FLUJO_EDITAR_JUGADOR = 'editar-jugador';

const PASOS = {
  equipo: 'equipo',
  jugador: 'jugador',
  menu: 'menu',
  posicion: 'posicion',
  fechaNacimiento: 'fecha-nacimiento',
  peso: 'peso',
  estatura: 'estatura',
} as const;

const PREFIJO_JUGADOR = 'ej:j:';
const PREFIJO_POSICION = 'ej:p:';
const OPCION_POSICION = 'ej:m:posicion';
const OPCION_FECHA = 'ej:m:fecha';
const OPCION_PESO = 'ej:m:peso';
const OPCION_ESTATURA = 'ej:m:estatura';
const OPCION_LISTO = 'ej:m:listo';

const CLAVE_JUGADOR_ID = 'jugadorId';
const CLAVE_PAGINA = 'paginaJugadores';
/** Nota efímera que el menú muestra una vez y descarta ("Guardado ✅"). */
const CLAVE_AVISO = 'aviso';

const BOTONES_POSICION: Boton[] = POSICIONES.map((p) => ({
  id: `${PREFIJO_POSICION}${p}`,
  texto: ETIQUETA_POSICION[p],
}));

/**
 * `/editarjugador`: posición y datos básicos (fecha de nacimiento, peso,
 * estatura), en un menú al que se vuelve después de cada dato -- mismo
 * patrón conversacional que `PlantillaFlujo` (selector de equipo → elegir
 * jugador → acción), con `rolMinimo: 'editor'` porque acá, a diferencia de
 * `/plantilla`, no hay nada que un viewer venga a solo mirar.
 */
@Injectable()
export class EditarJugadorFlujo {
  constructor(
    private readonly jugadores: JugadoresService,
    private readonly membresias: MembresiasService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_EDITAR_JUGADOR,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.jugador,
          rolMinimo: 'editor',
          pregunta: textos.editar.preguntaEquipo,
        }),
        this.pasoJugador(),
        this.pasoMenu(),
        this.pasoPosicion(),
        this.pasoFechaNacimiento(),
        this.pasoPeso(),
        this.pasoEstatura(),
      ],
    };
  }

  // --- Elegir jugador -----------------------------------------------------

  private pasoJugador(): Paso {
    const preguntar = async (ctx: ContextoFlujo, pagina: number): Promise<RespuestaBot> => {
      const plantilla = await this.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
      const { botones } = botonesPaginados(
        plantilla.map((j) => ({ id: `${PREFIJO_JUGADOR}${j.id}`, texto: describirJugador(j) })),
        pagina,
      );

      return { texto: textos.editar.elegirJugador(), botones };
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
          const siguiente = paginaSiguiente(pagina, plantilla.length);

          return {
            tipo: 'repetir',
            respuesta: await preguntar(ctx, siguiente),
            datos: { [CLAVE_PAGINA]: siguiente },
          };
        }

        if (!seleccion.startsWith(PREFIJO_JUGADOR)) {
          return { tipo: 'repetir', respuesta: await preguntar(ctx, pagina) };
        }

        return {
          tipo: 'ir',
          pasoId: PASOS.menu,
          datos: { [CLAVE_JUGADOR_ID]: seleccion.slice(PREFIJO_JUGADOR.length) },
        };
      },
    };
  }

  // --- Menú de edición ------------------------------------------------------

  private pasoMenu(): Paso {
    const botones: Boton[] = [
      { id: OPCION_POSICION, texto: textos.editar.botonPosicion },
      { id: OPCION_FECHA, texto: textos.editar.botonFechaNacimiento },
      { id: OPCION_PESO, texto: textos.editar.botonPeso },
      { id: OPCION_ESTATURA, texto: textos.editar.botonEstatura },
      { id: OPCION_LISTO, texto: textos.editar.botonListo },
    ];

    const preguntar = (ctx: ContextoFlujo, jugador: Jugador): RespuestaBot => {
      const aviso = leerTexto(ctx.datos, CLAVE_AVISO);
      const texto = [aviso, textos.editar.menu(describirJugador(jugador))].filter(Boolean);

      return { texto: texto.join('\n'), botones };
    };

    return {
      id: PASOS.menu,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const jugador = await this.jugadorDe(ctx);

        if (!jugador) return { transicion: this.jugadorPerdido() };

        const respuesta = preguntar(ctx, jugador);

        ctx.datos[CLAVE_AVISO] = '';

        return { respuesta };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const jugador = await this.jugadorDe(ctx);

        if (!jugador) return this.jugadorPerdido();

        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (seleccion === OPCION_POSICION) return { tipo: 'ir', pasoId: PASOS.posicion };
        if (seleccion === OPCION_FECHA) return { tipo: 'ir', pasoId: PASOS.fechaNacimiento };
        if (seleccion === OPCION_PESO) return { tipo: 'ir', pasoId: PASOS.peso };
        if (seleccion === OPCION_ESTATURA) return { tipo: 'ir', pasoId: PASOS.estatura };

        if (seleccion === OPCION_LISTO) {
          return { tipo: 'finalizar', respuesta: { texto: textos.editar.listo() } };
        }

        return { tipo: 'repetir', respuesta: preguntar(ctx, jugador) };
      },
    };
  }

  // --- Posición: cuatro botones, sin texto libre ---------------------------

  private pasoPosicion(): Paso {
    const preguntar = (): RespuestaBot => ({
      texto: textos.editar.posicion.pregunta(),
      botones: BOTONES_POSICION,
    });

    return {
      id: PASOS.posicion,

      entrar: () => Promise.resolve({ respuesta: preguntar() }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = (ctx.mensaje.seleccionId ?? '').slice(PREFIJO_POSICION.length);

        if (!esPosicion(seleccion)) {
          return { tipo: 'repetir', respuesta: preguntar() };
        }

        if (!(await this.puedeEditar(ctx))) return this.sinPermiso();

        await this.jugadores.actualizarPosicion(
          leerTexto(ctx.datos, CLAVE_EQUIPO_ID),
          leerTexto(ctx.datos, CLAVE_JUGADOR_ID),
          seleccion,
        );

        return this.alMenuConAviso();
      },
    };
  }

  // --- Fecha de nacimiento, peso, estatura: texto libre validado -----------

  private pasoFechaNacimiento(): Paso {
    const preguntar = (): RespuestaBot => ({ texto: textos.editar.fechaNacimiento.pregunta() });

    return {
      id: PASOS.fechaNacimiento,

      entrar: () => Promise.resolve({ respuesta: preguntar() }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const fechaNacimiento = parsearFechaNacimiento(ctx.mensaje.texto ?? '');

        if (fechaNacimiento === null) {
          return {
            tipo: 'repetir',
            respuesta: { texto: textos.editar.fechaNacimiento.invalida() },
          };
        }

        if (!(await this.puedeEditar(ctx))) return this.sinPermiso();

        await this.jugadores.actualizarDatosFisicos(
          leerTexto(ctx.datos, CLAVE_EQUIPO_ID),
          leerTexto(ctx.datos, CLAVE_JUGADOR_ID),
          { fechaNacimiento },
        );

        return this.alMenuConAviso();
      },
    };
  }

  private pasoPeso(): Paso {
    const preguntar = (): RespuestaBot => ({ texto: textos.editar.peso.pregunta() });

    return {
      id: PASOS.peso,

      entrar: () => Promise.resolve({ respuesta: preguntar() }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const pesoKg = parsearPeso(ctx.mensaje.texto ?? '');

        if (pesoKg === null) {
          return { tipo: 'repetir', respuesta: { texto: textos.editar.peso.invalido() } };
        }

        if (!(await this.puedeEditar(ctx))) return this.sinPermiso();

        await this.jugadores.actualizarDatosFisicos(
          leerTexto(ctx.datos, CLAVE_EQUIPO_ID),
          leerTexto(ctx.datos, CLAVE_JUGADOR_ID),
          { pesoKg },
        );

        return this.alMenuConAviso();
      },
    };
  }

  private pasoEstatura(): Paso {
    const preguntar = (): RespuestaBot => ({ texto: textos.editar.estatura.pregunta() });

    return {
      id: PASOS.estatura,

      entrar: () => Promise.resolve({ respuesta: preguntar() }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const estaturaCm = parsearEstatura(ctx.mensaje.texto ?? '');

        if (estaturaCm === null) {
          return { tipo: 'repetir', respuesta: { texto: textos.editar.estatura.invalida() } };
        }

        if (!(await this.puedeEditar(ctx))) return this.sinPermiso();

        await this.jugadores.actualizarDatosFisicos(
          leerTexto(ctx.datos, CLAVE_EQUIPO_ID),
          leerTexto(ctx.datos, CLAVE_JUGADOR_ID),
          { estaturaCm },
        );

        return this.alMenuConAviso();
      },
    };
  }

  // --- Comunes --------------------------------------------------------------

  private alMenuConAviso(): Transicion {
    return { tipo: 'ir', pasoId: PASOS.menu, datos: { [CLAVE_AVISO]: textos.editar.guardado() } };
  }

  private async jugadorDe(ctx: ContextoFlujo): Promise<Jugador | null> {
    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
    const jugadorId = leerTexto(ctx.datos, CLAVE_JUGADOR_ID);
    const plantilla = await this.jugadores.listar(equipoId, true);

    return plantilla.find((j) => j.id === jugadorId) ?? null;
  }

  private jugadorPerdido(): Transicion {
    return { tipo: 'finalizar', respuesta: { texto: textos.editar.ningunoEncontrado() } };
  }

  /**
   * Revalida el rol antes de escribir (RF-7.2): el rol pudo cambiar entre
   * que se mostró el menú y se contestó, mismo criterio que el resto de los
   * flujos que editan la plantilla.
   */
  private async puedeEditar(ctx: ContextoFlujo): Promise<boolean> {
    return ctx.usuarioId
      ? this.membresias.puede(ctx.usuarioId, leerTexto(ctx.datos, CLAVE_EQUIPO_ID), 'editor')
      : false;
  }

  private sinPermiso(): Transicion {
    return {
      tipo: 'finalizar',
      respuesta: { texto: textosComunes.sinPermisoPara('editar jugadores') },
    };
  }
}
