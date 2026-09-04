import type { Boton } from '../../channels/channel.types';
import type { EquipoDelUsuario, MembresiasService } from '../../identidad/membresias.service';
import type { Rol } from '../../identidad/roles';
import { textos } from '../../textos/pasos-comunes';
import type { ContextoFlujo, Entrada, Paso, Transicion } from '../flow.types';

export const CLAVE_EQUIPO_ID = 'equipoId';
export const CLAVE_EQUIPO_NOMBRE = 'equipoNombre';

const PREFIJO_SELECCION = 'eq:';

export interface OpcionesSelectorEquipo {
  /** Paso al que se cede el turno una vez resuelto el equipo. */
  siguiente: string;
  /** Rol mínimo; los equipos donde no se alcanza ni siquiera se ofrecen. */
  rolMinimo?: Rol;
  /** Encabezado de la pregunta cuando hay ambigüedad real. */
  pregunta?: string;
  /** Qué decir cuando no hay ningún equipo elegible. */
  sinEquipos?: string;
}

/**
 * Resuelve a qué equipo se refiere el usuario (RF-7.2).
 *
 * Es un paso de flujo, no un interceptor: un interceptor de Nest no puede
 * cortar la ejecución y devolver botones sin lanzar una excepción, y usar
 * excepciones para el camino normal oscurece el código.
 *
 * Con un solo equipo elegible se resuelve solo y cede el turno **sin escribir
 * nada** — que es exactamente lo que pide el requerimiento: al usuario de un
 * solo equipo nunca se le pregunta cuál.
 */
export function pasoSelectorEquipo(
  id: string,
  membresias: MembresiasService,
  opciones: OpcionesSelectorEquipo,
): Paso {
  const {
    siguiente,
    rolMinimo,
    pregunta = textos.selectorEquipo.pregunta,
    sinEquipos = textos.selectorEquipo.sinEquipos,
  } = opciones;

  const irA = (equipo: EquipoDelUsuario): Transicion => ({
    tipo: 'ir',
    pasoId: siguiente,
    datos: { [CLAVE_EQUIPO_ID]: equipo.equipoId, [CLAVE_EQUIPO_NOMBRE]: equipo.equipoNombre },
  });

  return {
    id,

    async entrar(ctx: ContextoFlujo): Promise<Entrada> {
      if (!ctx.usuarioId) {
        return { transicion: { tipo: 'finalizar', respuesta: { texto: sinEquipos } } };
      }

      const elegibles = await membresias.equiposDe(ctx.usuarioId, rolMinimo);

      if (elegibles.length === 0) {
        return {
          transicion: {
            tipo: 'finalizar',
            respuesta: { texto: mensajeSinEquipos(sinEquipos, rolMinimo) },
          },
        };
      }

      // Sin ambigüedad no hay nada que preguntar.
      if (elegibles.length === 1) {
        return { transicion: irA(elegibles[0]) };
      }

      return {
        respuesta: {
          texto: pregunta,
          botones: elegibles.map(botonDe),
        },
      };
    },

    async recibir(ctx: ContextoFlujo): Promise<Transicion> {
      const elegidos = await membresias.equiposDe(ctx.usuarioId ?? '', rolMinimo);
      const seleccion = ctx.mensaje.seleccionId;

      const equipo = seleccion?.startsWith(PREFIJO_SELECCION)
        ? elegidos.find((e) => e.equipoId === seleccion.slice(PREFIJO_SELECCION.length))
        : buscarPorNombre(elegidos, ctx.mensaje.texto);

      if (!equipo) {
        return {
          tipo: 'repetir',
          respuesta: {
            texto: textos.selectorEquipo.noReconocido,
            botones: elegidos.map(botonDe),
          },
        };
      }

      return irA(equipo);
    },
  };
}

function botonDe(equipo: EquipoDelUsuario): Boton {
  return {
    id: `${PREFIJO_SELECCION}${equipo.equipoId}`,
    // El rótulo se recorta porque WhatsApp trunca a 20 caracteres, y un
    // "Ringo Amaya — Sub-11..." ilegible no ayuda a elegir.
    texto: recortar(equipo.equipoNombre, 20),
  };
}

function buscarPorNombre(
  equipos: EquipoDelUsuario[],
  texto?: string,
): EquipoDelUsuario | undefined {
  if (!texto) return undefined;

  const buscado = texto.trim().toLowerCase();

  return equipos.find((e) => e.equipoNombre.trim().toLowerCase() === buscado);
}

function mensajeSinEquipos(base: string, rolMinimo?: Rol): string {
  if (!rolMinimo || rolMinimo === 'viewer') return base;

  // Distinguir "no tienes equipos" de "no tienes permiso" evita que alguien
  // crea que perdió su equipo cuando en realidad le falta un rol.
  return rolMinimo === 'admin'
    ? textos.selectorEquipo.sinEquiposAdmin
    : textos.selectorEquipo.sinEquiposEditor;
}

function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}
