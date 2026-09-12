import { Injectable } from '@nestjs/common';
import type { Boton } from '../channels/channel.types';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import { pasoSeleccionMultiple } from '../conversacion/pasos-comunes/seleccion-multiple';
import { CLAVE_EQUIPO_ID, pasoSelectorEquipo } from '../conversacion/pasos-comunes/selector-equipo';
// Utilidad genérica ("10, 7, jacob" -> ids), no algo propio de partidos: se
// reusa tal cual en vez de reimplementar el mismo parseo acá.
import { idsPorDorsalONombre } from '../eventos/cargar.flujo';
import { MembresiasService } from '../identidad/membresias.service';
import { describirJugador, JugadoresService } from '../jugadores/jugadores.service';
import { describirFecha } from '../partidos/fechas';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/entrenamientos';
import { type Entrenamiento, EntrenamientosService } from './entrenamientos.service';

export const FLUJO_ASISTENCIA = 'asistencia';

const PASOS = {
  equipo: 'equipo',
  cual: 'cual',
  presentes: 'presentes',
} as const;

const CLAVE_ENTRENAMIENTO_ID = 'entrenamientoId';
const PREFIJO_JUGADOR = 'jg:';
const PREFIJO_ENTRENAMIENTO = 'en:';

function botonDe(entrenamiento: Entrenamiento): Boton {
  return {
    id: `${PREFIJO_ENTRENAMIENTO}${entrenamiento.id}`,
    texto: describirFecha(entrenamiento.fecha),
  };
}

/**
 * `/asistencia`: marca presentes sobre la plantilla completa, tocando
 * botones -- mismo componente (`pasoSeleccionMultiple`) que
 * `pasoTitulares`/`pasoParticipantesPost` en `cargar.flujo.ts` usan para
 * elegir jugadores de un partido.
 */
@Injectable()
export class AsistenciaFlujo {
  constructor(
    private readonly entrenamientos: EntrenamientosService,
    private readonly membresias: MembresiasService,
    private readonly jugadores: JugadoresService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_ASISTENCIA,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.cual,
          rolMinimo: 'editor',
          pregunta: textos.asistencia.preguntaEquipo,
        }),
        this.pasoCual(),
        this.pasoPresentes(),
      ],
    };
  }

  /**
   * Resuelve qué entrenamiento: primero se asegura la sesión de hoy (acá es
   * donde se materializa una regla recurrente que le toque hoy), después
   * mira lo pendiente de asistencia. Sin ambigüedad no hay nada que
   * preguntar -- mismo criterio que `pasoSelectorEquipo`.
   */
  private pasoCual(): Paso {
    return {
      id: PASOS.cual,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);

        if (ctx.usuarioId) {
          await this.entrenamientos.asegurarSesionDeHoy(equipoId, ctx.usuarioId);
        }

        const pendientes = await this.entrenamientos.pendientesDeAsistencia(equipoId);

        if (pendientes.length === 0) {
          // Si ya hay una recurrencia activa que todavía no le tocaba a hoy,
          // decir "crea uno con /nuevoentrenamiento" sería mal consejo -- ya
          // existe, correr ese comando de nuevo solo duplicaría la regla.
          const proxima = await this.entrenamientos.proximaFechaRecurrente(equipoId);
          const texto = proxima
            ? textos.asistencia.sinPendientesConRecurrencia(proxima)
            : textos.asistencia.sinPendientes();

          return { transicion: { tipo: 'finalizar', respuesta: { texto } } };
        }

        if (pendientes.length === 1) {
          return {
            transicion: {
              tipo: 'ir',
              pasoId: PASOS.presentes,
              datos: { [CLAVE_ENTRENAMIENTO_ID]: pendientes[0].id },
            },
          };
        }

        return {
          respuesta: { texto: textos.asistencia.preguntaCual(), botones: pendientes.map(botonDe) },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const pendientes = await this.entrenamientos.pendientesDeAsistencia(equipoId);
        const seleccion = ctx.mensaje.seleccionId;

        const elegido = seleccion?.startsWith(PREFIJO_ENTRENAMIENTO)
          ? pendientes.find((e) => e.id === seleccion.slice(PREFIJO_ENTRENAMIENTO.length))
          : undefined;

        if (!elegido) {
          return {
            tipo: 'repetir',
            respuesta: { texto: textos.asistencia.tocaUno(), botones: pendientes.map(botonDe) },
          };
        }

        return {
          tipo: 'ir',
          pasoId: PASOS.presentes,
          datos: { [CLAVE_ENTRENAMIENTO_ID]: elegido.id },
        };
      },
    };
  }

  private pasoPresentes(): Paso {
    return pasoSeleccionMultiple(PASOS.presentes, {
      pregunta: textos.asistencia.preguntaPresentes(),
      // A diferencia de la titular de un partido, "nadie vino" es un
      // resultado válido de asistencia, así que el mínimo es 0.
      minimo: 0,
      mostrarNinguno: true,
      sinOpciones: textos.asistencia.sinJugadores(),
      obtenerOpciones: async (ctx) => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const plantilla = await this.jugadores.listar(equipoId);

        return plantilla.map((j) => ({
          id: `${PREFIJO_JUGADOR}${j.id}`,
          texto: describirJugador(j),
        }));
      },
      interpretarTexto: async (ctx, texto) => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const plantilla = await this.jugadores.listar(equipoId);
        const resultado = idsPorDorsalONombre(texto, plantilla);

        if (!resultado) return null;

        return {
          ids: resultado.ids.map((id) => `${PREFIJO_JUGADOR}${id}`),
          sinReconocer: resultado.sinReconocer,
        };
      },
      avisoTextoNoReconocido: textos.asistencia.avisoTextoNoReconocido,
      alConfirmar: async (ctx, elegidos) => {
        const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
        const puede = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
          : false;

        if (!puede) {
          return {
            tipo: 'finalizar',
            respuesta: {
              texto: textosComunes.permisoRevocado('editor', 'no guardé la asistencia'),
            },
          };
        }

        const entrenamientoId = leerTexto(ctx.datos, CLAVE_ENTRENAMIENTO_ID);
        const idsJugadores = elegidos.map((id) => id.slice(PREFIJO_JUGADOR.length));

        await this.entrenamientos.guardarPresentes(
          entrenamientoId,
          ctx.usuarioId ?? '',
          idsJugadores,
        );

        const total = (await this.jugadores.listar(equipoId)).length;

        return {
          tipo: 'finalizar',
          respuesta: { texto: textos.asistencia.guardada(idsJugadores.length, total) },
        };
      },
    });
  }
}
