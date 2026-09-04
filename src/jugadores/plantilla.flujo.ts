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
import { MembresiasService } from '../identidad/membresias.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/jugadores';
import { CLAVE_ALTAS, pasoCargarPlantilla } from './pasos-plantilla';
import { describirJugador, JugadoresService } from './jugadores.service';

export const FLUJO_PLANTILLA = 'plantilla';

const PASOS = {
  equipo: 'equipo',
  ver: 'ver',
  agregar: 'agregar',
  bajaElegir: 'baja-elegir',
} as const;

const OPCION_AGREGAR = 'pl:agregar';
const OPCION_BAJA = 'pl:baja';
const OPCION_CERRAR = 'pl:cerrar';
const PREFIJO_BAJA = 'pl:b:';
const CLAVE_PAGINA = 'paginaBaja';

@Injectable()
export class PlantillaFlujo {
  constructor(
    private readonly jugadores: JugadoresService,
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
        pasoCargarPlantilla(PASOS.agregar, this.jugadores, {
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

        const cuerpo =
          lista.length === 0
            ? textos.ver.plantillaVacia()
            : lista.map((j) => `• ${describirJugador(j)}`).join('\n');

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
          return Promise.resolve({
            tipo: 'ir',
            pasoId: PASOS.agregar,
            datos: { [CLAVE_ALTAS]: 0 },
          });
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
