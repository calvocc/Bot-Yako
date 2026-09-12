import { Injectable } from '@nestjs/common';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import { pasoSeleccionMultiple } from '../conversacion/pasos-comunes/seleccion-multiple';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import { MembresiasService } from '../identidad/membresias.service';
import { hoyLocal, parsearFecha, sumarDias } from '../partidos/fechas';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/entrenamientos';
import { EntrenamientosService } from './entrenamientos.service';

export const FLUJO_NUEVO_ENTRENAMIENTO = 'nuevo-entrenamiento';

const PASOS = {
  equipo: 'equipo',
  recurrente: 'recurrente',
  fecha: 'fecha',
  dias: 'dias',
} as const;

const PREFIJO_FECHA = 'fe:';
const ID_SOLO_ESTA_VEZ = 'rec:no';
const ID_SE_REPITE = 'rec:si';
const PREFIJO_DIA = 'dia:';

/** Índice 0 = domingo, igual que `Date.getUTCDay()` -- ver `diaSemanaDe` en `entrenamientos.service.ts`. */
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * `/nuevoentrenamiento`: crea una sesión puntual o una regla recurrente
 * (equipo + días de la semana).
 *
 * Se pregunta primero si se repite y recién después la fecha -- y solo en el
 * camino puntual: una recurrencia se define por sus días de la semana, no
 * por una fecha puntual, así que pedirla ahí no aporta nada y confundía
 * ("elegí Hoy" antes de elegir Martes/Jueves hacía pensar que hoy quedaba
 * una sesión armada, aunque hoy no fuera ninguno de esos días).
 */
@Injectable()
export class NuevoEntrenamientoFlujo {
  constructor(
    private readonly entrenamientos: EntrenamientosService,
    private readonly membresias: MembresiasService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_NUEVO_ENTRENAMIENTO,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.recurrente,
          rolMinimo: 'editor',
          pregunta: textos.nuevoEntrenamiento.preguntaEquipo,
        }),
        this.pasoRecurrente(),
        this.pasoFecha(),
        this.pasoDias(),
      ],
    };
  }

  private pasoRecurrente(): Paso {
    return {
      id: PASOS.recurrente,

      entrar: (): Promise<Entrada> =>
        Promise.resolve({
          respuesta: {
            texto: textos.nuevoEntrenamiento.preguntaRecurrente(),
            botones: [
              { id: ID_SOLO_ESTA_VEZ, texto: textos.nuevoEntrenamiento.botonSoloEstaVez },
              { id: ID_SE_REPITE, texto: textos.nuevoEntrenamiento.botonSeRepite },
            ],
          },
        }),

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        if (ctx.mensaje.seleccionId === ID_SE_REPITE) {
          return Promise.resolve({ tipo: 'ir', pasoId: PASOS.dias });
        }

        return Promise.resolve({ tipo: 'ir', pasoId: PASOS.fecha });
      },
    };
  }

  /** Solo en el camino puntual ("solo esta vez"). */
  private pasoFecha(): Paso {
    return {
      id: PASOS.fecha,

      entrar: (): Promise<Entrada> => {
        const hoy = hoyLocal();

        return Promise.resolve({
          respuesta: {
            texto: textos.nuevoEntrenamiento.preguntaFecha(),
            botones: [
              { id: `${PREFIJO_FECHA}${hoy}`, texto: textos.nuevoEntrenamiento.botonHoy },
              {
                id: `${PREFIJO_FECHA}${sumarDias(hoy, -1)}`,
                texto: textos.nuevoEntrenamiento.botonAyer,
              },
              {
                id: `${PREFIJO_FECHA}${sumarDias(hoy, 1)}`,
                texto: textos.nuevoEntrenamiento.botonManana,
              },
            ],
          },
        });
      },

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;
        const fecha = seleccion?.startsWith(PREFIJO_FECHA)
          ? seleccion.slice(PREFIJO_FECHA.length)
          : parsearFecha(ctx.mensaje.texto ?? '');

        if (!fecha) {
          return Promise.resolve({
            tipo: 'repetir',
            respuesta: { texto: textos.nuevoEntrenamiento.fechaNoEntendida() },
          });
        }

        return this.crearPuntual(ctx, fecha);
      },
    };
  }

  private pasoDias(): Paso {
    return pasoSeleccionMultiple(PASOS.dias, {
      pregunta: textos.nuevoEntrenamiento.preguntaDias(),
      minimo: 1,
      obtenerOpciones: () =>
        Promise.resolve(
          NOMBRES_DIA.map((nombre, dia) => ({ id: `${PREFIJO_DIA}${dia}`, texto: nombre })),
        ),
      alConfirmar: (ctx, elegidos) => this.crearRecurrente(ctx, elegidos),
    });
  }

  private async crearPuntual(ctx: ContextoFlujo, fecha: string): Promise<Transicion> {
    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
    const puede = ctx.usuarioId
      ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
      : false;

    if (!puede) return this.sinPermiso();

    const equipoNombre = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo');

    await this.entrenamientos.crearPuntual(equipoId, fecha, ctx.usuarioId ?? '');

    return {
      tipo: 'finalizar',
      respuesta: { texto: textos.nuevoEntrenamiento.creadoPuntual(equipoNombre, fecha) },
    };
  }

  private async crearRecurrente(ctx: ContextoFlujo, elegidos: string[]): Promise<Transicion> {
    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
    const puede = ctx.usuarioId
      ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
      : false;

    if (!puede) return this.sinPermiso();

    const equipoNombre = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo');
    const diasSemana = elegidos
      .map((id) => Number(id.slice(PREFIJO_DIA.length)))
      .sort((a, b) => a - b);
    const diasTexto = diasSemana.map((dia) => NOMBRES_DIA[dia]).join(', ');

    // El ancla siempre es hoy: una recurrencia se define por sus días de la
    // semana, no por una fecha puntual que ya no se le pide al usuario acá.
    const hoy = hoyLocal();
    const { entrenamiento } = await this.entrenamientos.crearRecurrente(
      equipoId,
      diasSemana,
      ctx.usuarioId ?? '',
      hoy,
    );

    if (entrenamiento) {
      return {
        tipo: 'finalizar',
        respuesta: {
          texto: textos.nuevoEntrenamiento.creadoRecurrente(equipoNombre, diasTexto, hoy),
        },
      };
    }

    // Hoy no es uno de los días elegidos: la regla queda creada igual, y
    // acá sí vale la pena decir cuándo es la próxima -- sin esto, alguien
    // que corre /asistencia el mismo día ve "no hay nada" sin saber por qué.
    const proxima = await this.entrenamientos.proximaFechaRecurrente(equipoId, hoy);

    return {
      tipo: 'finalizar',
      respuesta: {
        texto: textos.nuevoEntrenamiento.creadaSinPrimeraSesion(
          equipoNombre,
          diasTexto,
          proxima ?? hoy,
        ),
      },
    };
  }

  private sinPermiso(): Transicion {
    return {
      tipo: 'finalizar',
      respuesta: { texto: textosComunes.permisoRevocado('editor', 'no creé nada') },
    };
  }
}
