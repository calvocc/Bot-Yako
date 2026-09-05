import { Injectable } from '@nestjs/common';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import {
  botonesPaginados,
  ID_VER_MAS,
  paginaSiguiente,
} from '../conversacion/pasos-comunes/paginacion';
import { EquiposService } from '../equipos/equipos.service';
import { MembresiasService } from '../identidad/membresias.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/jugadores';
import { CLAVE_ALTAS, pasoCargarPlantilla } from './pasos-plantilla';
import {
  candidatosDeEquipo,
  describirJugador,
  formatearListaJugadores,
  JugadoresService,
  type CandidatoAcademia,
} from './jugadores.service';

export const FLUJO_PLANTILLA = 'plantilla';

const PASOS = {
  equipo: 'equipo',
  ver: 'ver',
  agregarModo: 'agregar-modo',
  agregar: 'agregar',
  agregarBuscarNombre: 'agregar-buscar-nombre',
  agregarElegirCandidato: 'agregar-elegir-candidato',
  bajaElegir: 'baja-elegir',
} as const;

const OPCION_AGREGAR = 'pl:agregar';
const OPCION_BAJA = 'pl:baja';
const OPCION_CERRAR = 'pl:cerrar';
const OPCION_MODO_LISTA = 'pl:m:lista';
const OPCION_MODO_ACADEMIA = 'pl:m:academia';
const PREFIJO_BAJA = 'pl:b:';
const PREFIJO_CANDIDATO = 'pl:c:';
const CLAVE_PAGINA = 'paginaBaja';
const CLAVE_BUSQUEDA = 'busquedaAcademia';
const CLAVE_PAGINA_CANDIDATOS = 'paginaCandidatos';

@Injectable()
export class PlantillaFlujo {
  constructor(
    private readonly jugadores: JugadoresService,
    private readonly equipos: EquiposService,
    private readonly membresias: MembresiasService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_PLANTILLA,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.ver,
          pregunta: textos.preguntaEquipo,
        }),
        this.pasoVer(),
        this.pasoAgregarModo(),
        pasoCargarPlantilla(PASOS.agregar, this.jugadores, this.equipos, {
          claveEquipoId: CLAVE_EQUIPO_ID,
          // A diferencia del onboarding, acá el equipo ya existía: el rol pudo
          // cambiar entre que se abrió el flujo y se escribe.
          puedeEscribir: (ctx) =>
            ctx.usuarioId
              ? this.membresias.puede(
                  ctx.usuarioId,
                  leerTexto(ctx.datos, CLAVE_EQUIPO_ID),
                  'editor',
                )
              : Promise.resolve(false),
          alTerminar: (_ctx, cargados) => ({
            tipo: 'finalizar',
            respuesta: {
              texto:
                cargados === 0
                  ? textos.agregar.ningunoAgregado()
                  : textos.agregar.agregados(cargados),
            },
          }),
        }),
        this.pasoAgregarBuscarNombre(),
        this.pasoAgregarElegirCandidato(),
        this.pasoBajaElegir(),
      ],
    };
  }

  /** Muestra la plantilla; las acciones de edición solo si el rol alcanza. */
  private pasoVer(): Paso {
    return {
      id: PASOS.ver,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const lista = await this.jugadores.listar(equipoId);
        const puedeEditar = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
          : false;

        const cuerpo = formatearListaJugadores(lista, textos.ver.plantillaVacia());

        return {
          respuesta: {
            texto: textos.ver.encabezado(
              leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE),
              lista.length,
              cuerpo,
            ),
            botones: puedeEditar
              ? [
                  { id: OPCION_AGREGAR, texto: textos.ver.botonAgregar },
                  ...(lista.length > 0 ? [{ id: OPCION_BAJA, texto: textos.ver.botonBaja }] : []),
                  { id: OPCION_CERRAR, texto: textos.ver.botonCerrar },
                ]
              : undefined,
          },
        };
      },

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;

        if (seleccion === OPCION_AGREGAR) {
          return Promise.resolve({ tipo: 'ir', pasoId: PASOS.agregarModo });
        }

        if (seleccion === OPCION_BAJA) {
          return Promise.resolve({
            tipo: 'ir',
            pasoId: PASOS.bajaElegir,
            datos: { [CLAVE_PAGINA]: 0 },
          });
        }

        // Con respuesta explícita: un `finalizar` mudo dejaba al usuario con
        // un "ese botón ya no está disponible" al tocar "Listo".
        return Promise.resolve({
          tipo: 'finalizar',
          respuesta: { texto: textos.ver.cerrado() },
        });
      },
    };
  }

  /**
   * "Agregar" ahora tiene dos caminos: pegar una lista (lo de siempre) o
   * buscar a alguien que ya juega en otro equipo de la academia, para
   * vincularlo en vez de crear una ficha nueva sin relación (Frente A).
   */
  private pasoAgregarModo(): Paso {
    return {
      id: PASOS.agregarModo,

      entrar: () =>
        Promise.resolve({
          respuesta: {
            texto: textos.agregar.elegirModo.pregunta(),
            botones: [
              { id: OPCION_MODO_LISTA, texto: textos.agregar.elegirModo.botonLista },
              { id: OPCION_MODO_ACADEMIA, texto: textos.agregar.elegirModo.botonDeAcademia },
            ],
          },
        }),

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;

        if (seleccion === OPCION_MODO_ACADEMIA) {
          return Promise.resolve({ tipo: 'ir', pasoId: PASOS.agregarBuscarNombre });
        }

        // Cualquier otra cosa (incluido tocar "Pegar lista") va al camino de
        // siempre, que ya sabe interpretar texto libre.
        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.agregar,
          datos: { [CLAVE_ALTAS]: 0 },
        });
      },
    };
  }

  private pasoAgregarBuscarNombre(): Paso {
    return {
      id: PASOS.agregarBuscarNombre,

      entrar: () =>
        Promise.resolve({
          respuesta: { texto: textos.agregar.buscarNombre.pregunta() },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const nombre = ctx.mensaje.texto?.trim();

        if (!nombre) {
          return { tipo: 'repetir', respuesta: { texto: textos.agregar.buscarNombre.pregunta() } };
        }

        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const candidatos = await candidatosDeEquipo(this.equipos, this.jugadores, equipoId, nombre);

        if (candidatos.length === 0) {
          return {
            tipo: 'repetir',
            respuesta: { texto: textos.agregar.buscarNombre.sinCandidatos(nombre) },
          };
        }

        return {
          tipo: 'ir',
          pasoId: PASOS.agregarElegirCandidato,
          datos: { [CLAVE_BUSQUEDA]: nombre, [CLAVE_PAGINA_CANDIDATOS]: 0 },
        };
      },
    };
  }

  private pasoAgregarElegirCandidato(): Paso {
    return {
      id: PASOS.agregarElegirCandidato,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const candidatos = await this.candidatosDe(ctx);
        const pagina = leerNumero(ctx.datos, CLAVE_PAGINA_CANDIDATOS);
        const { botones } = botonesPaginados(
          candidatos.map((c) => ({
            id: `${PREFIJO_CANDIDATO}${c.jugadorId}`,
            // El equipo va primero: el botón se recorta a 20 caracteres
            // (`botonesPaginados`) y es lo que de verdad distingue entre
            // candidatos — el nombre ya lo escribió el usuario recién.
            texto: `${c.equipoNombre} — ${describirJugador({ nombre: c.nombre, dorsal: c.dorsal ?? undefined })}`,
          })),
          pagina,
        );

        return { respuesta: { texto: textos.agregar.elegirCandidato.pregunta(), botones } };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        // La búsqueda por academia no hace falta para descartar un botón
        // viejo o un texto suelto: se pide solo en las dos ramas que sí la
        // usan, no antes de saber cuál es.
        if (seleccion !== ID_VER_MAS && !seleccion.startsWith(PREFIJO_CANDIDATO)) {
          return { tipo: 'finalizar', respuesta: { texto: textos.agregar.ningunoAgregado() } };
        }

        const candidatos = await this.candidatosDe(ctx);

        if (seleccion === ID_VER_MAS) {
          return {
            tipo: 'ir',
            pasoId: PASOS.agregarElegirCandidato,
            datos: {
              [CLAVE_PAGINA_CANDIDATOS]: paginaSiguiente(
                leerNumero(ctx.datos, CLAVE_PAGINA_CANDIDATOS),
                candidatos.length,
              ),
            },
          };
        }

        const jugadorOrigenId = seleccion.slice(PREFIJO_CANDIDATO.length);
        const candidato = candidatos.find((c) => c.jugadorId === jugadorOrigenId);

        if (!candidato) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textosComunes.noEncontre('a esa persona') },
          };
        }

        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);

        // Se relee el permiso en el momento de escribir: el rol pudo cambiar
        // entre que se mostró el botón y se pulsó.
        const puede = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
          : false;

        if (!puede) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textosComunes.sinPermisoPara('editar la plantilla') },
          };
        }

        const vinculado = await this.jugadores.vincularNuevoEquipo(
          equipoId,
          { nombre: candidato.nombre, dorsal: candidato.dorsal ?? undefined },
          jugadorOrigenId,
        );

        return {
          tipo: 'finalizar',
          respuesta: { texto: textos.agregar.vinculado(vinculado.nombre, candidato.equipoNombre) },
        };
      },
    };
  }

  /** Repite la misma búsqueda que armó la lista, para no cargar candidatos completos en `datos`. */
  private candidatosDe(ctx: ContextoFlujo): Promise<CandidatoAcademia[]> {
    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
    const nombre = leerTexto(ctx.datos, CLAVE_BUSQUEDA);

    return candidatosDeEquipo(this.equipos, this.jugadores, equipoId, nombre);
  }

  private pasoBajaElegir(): Paso {
    return {
      id: PASOS.bajaElegir,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const lista = await this.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));
        const pagina = leerNumero(ctx.datos, CLAVE_PAGINA);
        const { botones } = botonesPaginados(
          lista.map((j) => ({ id: `${PREFIJO_BAJA}${j.id}`, texto: describirJugador(j) })),
          pagina,
        );

        return {
          respuesta: { texto: textos.baja.pregunta(), botones },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId ?? '';

        if (seleccion === ID_VER_MAS) {
          const lista = await this.jugadores.listar(leerTexto(ctx.datos, CLAVE_EQUIPO_ID));

          return {
            tipo: 'ir',
            pasoId: PASOS.bajaElegir,
            datos: {
              [CLAVE_PAGINA]: paginaSiguiente(leerNumero(ctx.datos, CLAVE_PAGINA), lista.length),
            },
          };
        }

        if (!seleccion.startsWith(PREFIJO_BAJA)) {
          return { tipo: 'finalizar', respuesta: { texto: textos.baja.ningunoDeBaja() } };
        }

        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const jugadorId = seleccion.slice(PREFIJO_BAJA.length);

        // Se relee el permiso en el momento de escribir: el rol pudo cambiar
        // entre que se mostró el botón y se pulsó.
        const puede = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
          : false;

        if (!puede) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textosComunes.sinPermisoPara('editar la plantilla') },
          };
        }

        const listo = await this.jugadores.desactivar(equipoId, jugadorId);

        return {
          tipo: 'finalizar',
          respuesta: {
            texto: listo ? textos.baja.dadoDeBaja() : textosComunes.noEncontre('a ese jugador'),
          },
        };
      },
    };
  }
}
