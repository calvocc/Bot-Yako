import { Injectable } from '@nestjs/common';
import {
  CLAVE_EQUIPO_ID,
  CLAVE_EQUIPO_NOMBRE,
  pasoSelectorEquipo,
} from '../conversacion/pasos-comunes/selector-equipo';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import { MembresiasService } from '../identidad/membresias.service';
import {
  botonesPaginados,
  ID_VER_MAS,
  paginaSiguiente,
} from '../conversacion/pasos-comunes/paginacion';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/partidos';
import { describirFecha } from './fechas';
import { describirMarcador, type Partido } from './partido.mapper';
import { PartidosService } from './partidos.service';

export const FLUJO_REABRIR = 'reabrir';

const PASOS = { equipo: 'equipo', partido: 'partido' } as const;

const CLAVE_PAGINA = 'paginaPartidos';
const PREFIJO_PARTIDO = 'pt:';

/**
 * `/reabrir` — devuelve un partido cerrado al estado editable.
 *
 * Va en un flujo aparte del de carga porque pide rol de admin y lista lo
 * contrario: los partidos cerrados. Meterlo en `/cargar` habría obligado a que
 * el selector de equipo cambiara de rol mínimo según el comando.
 */
@Injectable()
export class ReabrirFlujo {
  constructor(
    private readonly partidos: PartidosService,
    private readonly membresias: MembresiasService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_REABRIR,
      pasoInicial: PASOS.equipo,
      pasos: [
        pasoSelectorEquipo(PASOS.equipo, this.membresias, {
          siguiente: PASOS.partido,
          rolMinimo: 'admin',
          pregunta: textos.reabrir.preguntaEquipo,
        }),
        this.pasoPartido(),
      ],
    };
  }

  private pasoPartido(): Paso {
    const cerrados = async (ctx: ContextoFlujo): Promise<Partido[]> =>
      this.partidos.cerradosDe(leerTexto(ctx.datos, CLAVE_EQUIPO_ID), 30);

    const preguntar = (lista: Partido[], pagina: number) =>
      botonesPaginados(
        lista.map((p) => ({
          id: `${PREFIJO_PARTIDO}${p.id}`,
          texto: `${p.rival} ${describirMarcador(p)}`,
        })),
        pagina,
      ).botones;

    return {
      id: PASOS.partido,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const lista = await cerrados(ctx);

        if (lista.length === 0) {
          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: { texto: textos.reabrir.sinPartidosCerrados() },
            },
          };
        }

        return {
          respuesta: { texto: textos.reabrir.preguntaCual(), botones: preguntar(lista, 0) },
        };
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const lista = await cerrados(ctx);
        const seleccion = ctx.mensaje.seleccionId ?? '';
        const pagina = Number(ctx.datos[CLAVE_PAGINA] ?? 0);

        if (seleccion === ID_VER_MAS) {
          const siguiente = paginaSiguiente(pagina, lista.length);

          return {
            tipo: 'repetir',
            respuesta: {
              texto: textos.reabrir.preguntaCual(),
              botones: preguntar(lista, siguiente),
            },
            datos: { [CLAVE_PAGINA]: siguiente },
          };
        }

        const elegido = lista.find((p) => `${PREFIJO_PARTIDO}${p.id}` === seleccion);

        if (!elegido) {
          return {
            tipo: 'repetir',
            respuesta: { texto: textos.reabrir.tocaUnPartido(), botones: preguntar(lista, pagina) },
          };
        }

        // El rol se comprobó al elegir el equipo, pero desde entonces pudo
        // revocarse: la sesión dura una hora.
        const sigueSiendoAdmin = ctx.usuarioId
          ? await this.membresias.puede(ctx.usuarioId, elegido.equipoId, 'admin')
          : false;

        if (!sigueSiendoAdmin) {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textosComunes.permisoRevocado('no reabrí nada') },
          };
        }

        const resultado = await this.partidos.reabrir(elegido.id);

        if (resultado.tipo === 'no_existe') {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textosComunes.noEncontre('ese partido') },
          };
        }

        if (resultado.tipo === 'no_estaba_cerrado') {
          return {
            tipo: 'finalizar',
            respuesta: { texto: textos.reabrir.yaLoReabrieron() },
          };
        }

        const equipoNombre = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE, 'Tu equipo');

        return {
          tipo: 'finalizar',
          respuesta: {
            texto: textos.reabrir.reabierto(
              equipoNombre,
              elegido.rival,
              describirFecha(elegido.fecha),
            ),
          },
        };
      },
    };
  }
}
