import type { Boton } from '../../channels/channel.types';
import { textos } from '../../textos/pasos-comunes';
import type { ContextoFlujo, DatosFlujo, Entrada, Paso, Transicion } from '../flow.types';
import { leerNumero } from '../flow.types';
import { botonesPaginados, ID_VER_MAS, type OpcionPaginable, paginaSiguiente } from './paginacion';

const CLAVE_SELECCION = 'seleccionMultiple';
const CLAVE_PAGINA = 'paginaSeleccionMultiple';
const ID_CONFIRMAR = 'sm:listo';
/** Un solo botón fijo ("Listo"), a descontar del tamaño de página. */
const RESERVA_BOTON_CONFIRMAR = 1;

export interface OpcionesSeleccionMultiple {
  /** Texto de la pregunta, arriba de la lista. */
  pregunta: string;
  /** Las opciones para esta visita al paso — ids estables, no posicionales. */
  obtenerOpciones(ctx: ContextoFlujo): Promise<OpcionPaginable[]>;
  /** Qué hacer con los ids elegidos al confirmar. */
  alConfirmar(ctx: ContextoFlujo, elegidos: string[]): Promise<Transicion>;
  /** Mínimo para poder confirmar. Por defecto 1: no tiene sentido un mínimo de 0. */
  minimo?: number;
  /** Rótulo del botón de confirmar, sin el conteo — por defecto "Listo". */
  textoConfirmar?: string;
  /** Qué decir si `obtenerOpciones` no tiene nada para ofrecer. */
  sinOpciones?: string;
}

/**
 * Selección de varios elementos de una lista, con toggle y paginación.
 *
 * Cada opción es su propio botón; tocarlo prende o apaga una marca (✅) sin
 * cambiar de paso, y "Listo" confirma. Los ids que entrega `obtenerOpciones`
 * viajan tal cual como id de botón —igual que `pasoSelectorEquipo`—, así que
 * no hay ventana de carrera por índices posicionales: paginar o que la lista
 * cambie entre toques no corre lo ya marcado.
 */
export function pasoSeleccionMultiple(id: string, opciones: OpcionesSeleccionMultiple): Paso {
  const minimo = opciones.minimo ?? 1;

  const leerSeleccion = (datos: DatosFlujo): string[] => {
    const valor = datos[CLAVE_SELECCION];

    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
  };

  const armar = (
    lista: readonly OpcionPaginable[],
    elegidos: readonly string[],
    pagina: number,
    aviso?: string,
  ): { texto: string; botones: Boton[] } => {
    const marcadas = lista.map((o) => ({
      id: o.id,
      texto: elegidos.includes(o.id) ? textos.marcaSeleccionado(o.texto) : o.texto,
    }));
    const { botones } = botonesPaginados(marcadas, pagina, RESERVA_BOTON_CONFIRMAR);

    botones.push({
      id: ID_CONFIRMAR,
      texto: `${opciones.textoConfirmar ?? textos.confirmarListo} (${elegidos.length})`,
    });

    return {
      texto: [aviso, opciones.pregunta].filter(Boolean).join('\n\n'),
      botones,
    };
  };

  return {
    id,

    entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
      const lista = await opciones.obtenerOpciones(ctx);

      if (lista.length === 0 && opciones.sinOpciones) {
        return {
          transicion: { tipo: 'finalizar', respuesta: { texto: opciones.sinOpciones } },
        };
      }

      return { respuesta: armar(lista, [], 0) };
    },

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const seleccion = ctx.mensaje.seleccionId ?? '';
      const lista = await opciones.obtenerOpciones(ctx);
      const elegidos = leerSeleccion(ctx.datos);
      const pagina = leerNumero(ctx.datos, CLAVE_PAGINA, 0);

      if (seleccion === ID_VER_MAS) {
        const siguiente = paginaSiguiente(pagina, lista.length, RESERVA_BOTON_CONFIRMAR);

        return {
          tipo: 'repetir',
          respuesta: armar(lista, elegidos, siguiente),
          datos: { [CLAVE_PAGINA]: siguiente },
        };
      }

      if (seleccion === ID_CONFIRMAR) {
        if (elegidos.length < minimo) {
          return {
            tipo: 'repetir',
            respuesta: armar(lista, elegidos, pagina, textos.eligeAlMenos(minimo)),
          };
        }

        return opciones.alConfirmar(ctx, elegidos);
      }

      // Cualquier otro id conocido de la lista actual prende o apaga su marca.
      if (lista.some((o) => o.id === seleccion)) {
        const nuevos = elegidos.includes(seleccion)
          ? elegidos.filter((elegido) => elegido !== seleccion)
          : [...elegidos, seleccion];

        return {
          tipo: 'repetir',
          respuesta: armar(lista, nuevos, pagina),
          datos: { [CLAVE_SELECCION]: nuevos },
        };
      }

      return { tipo: 'repetir', respuesta: armar(lista, elegidos, pagina) };
    },
  };
}
