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
  fecha: 'fecha',
  recurrente: 'recurrente',
  dias: 'dias',
} as const;

const CLAVE_FECHA = 'fecha';
const PREFIJO_FECHA = 'fe:';
const ID_SOLO_ESTA_VEZ = 'rec:no';
const ID_SE_REPITE = 'rec:si';
const PREFIJO_DIA = 'dia:';

/** Índice 0 = domingo, igual que `Date.getUTCDay()` -- ver `diaSemanaDe` en `entrenamientos.service.ts`. */
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * `/nuevoentrenamiento`: crea una sesión puntual o una regla recurrente
 * (equipo + días de la semana). Mismo esqueleto que `NuevoPartidoFlujo`:
 * selector de equipo reusado, fecha con los mismos botones Hoy/Ayer/Mañana.
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
          siguiente: PASOS.fecha,
          rolMinimo: 'editor',
          pregunta: textos.nuevoEntrenamiento.preguntaEquipo,
        }),
        this.pasoFecha(),
        this.pasoRecurrente(),
        this.pasoDias(),
      ],
    };
  }

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

        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.recurrente,
          datos: { [CLAVE_FECHA]: fecha },
        });
      },
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

        return this.crearPuntual(ctx);
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

  private async crearPuntual(ctx: ContextoFlujo): Promise<Transicion> {
    const equipoId = leerTexto(ctx.datos, CLAVE_EQUIPO_ID);
    const puede = ctx.usuarioId
      ? await this.membresias.puede(ctx.usuarioId, equipoId, 'editor')
      : false;

    if (!puede) return this.sinPermiso();

    const fecha = leerTexto(ctx.datos, CLAVE_FECHA, hoyLocal());
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

    const fecha = leerTexto(ctx.datos, CLAVE_FECHA, hoyLocal());
    const equipoNombre = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo');
    const diasSemana = elegidos
      .map((id) => Number(id.slice(PREFIJO_DIA.length)))
      .sort((a, b) => a - b);
    const diasTexto = diasSemana.map((dia) => NOMBRES_DIA[dia]).join(', ');

    const { entrenamiento } = await this.entrenamientos.crearRecurrente(
      equipoId,
      diasSemana,
      ctx.usuarioId ?? '',
      fecha,
    );

    const texto = entrenamiento
      ? textos.nuevoEntrenamiento.creadoRecurrente(equipoNombre, diasTexto, fecha)
      : textos.nuevoEntrenamiento.creadaSinPrimeraSesion(equipoNombre, diasTexto);

    return { tipo: 'finalizar', respuesta: { texto } };
  }

  private sinPermiso(): Transicion {
    return {
      tipo: 'finalizar',
      respuesta: { texto: textosComunes.permisoRevocado('editor', 'no creé nada') },
    };
  }
}
