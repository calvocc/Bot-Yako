import type { Boton, RespuestaBot } from '../../channels/channel.types';
import { textos } from '../../textos/pasos-comunes';
import type { ContextoFlujo, DatosFlujo, Entrada, Paso, Transicion } from '../flow.types';
import { leerNumero } from '../flow.types';
import { botonesPaginados, ID_VER_MAS, type OpcionPaginable, paginaSiguiente } from './paginacion';

const CLAVE_SELECCION = 'seleccionMultiple';
const CLAVE_PAGINA = 'paginaSeleccionMultiple';
const ID_CONFIRMAR = 'sm:listo';
const ID_TODOS = 'sm:todos';
const ID_NINGUNO = 'sm:ninguno';
/** "Listo", "Todos" y "Ninguno": tres botones fijos, a descontar del tamaño de página. */
const RESERVA_BOTONES_FIJOS = 3;

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
  /**
   * Atajo por texto: escribir en vez de tocar botones uno por uno.
   *
   * Si lo da el paso, un mensaje de texto se prueba acá antes de tratarlo como
   * "no reconocido". `null` significa que no reconoció nada de nada — ahí se
   * repite el paso con `avisoTextoNoReconocido`, igual que siempre. Reconocer
   * *algo* devuelve `ids` (reemplaza la selección entera, no la suma a la
   * anterior) más `sinReconocer`: los tokens crudos que no matchearon a
   * nadie, para poder avisar de una coincidencia parcial en vez de aplicarla
   * en silencio. Recibe `ctx` para que un llamador pueda resolver contra el
   * dato real (por ejemplo la plantilla completa) en vez de tener que
   * reparsear `lista`, que solo trae el texto ya renderizado del botón.
   */
  interpretarTexto?(
    ctx: ContextoFlujo,
    texto: string,
    lista: readonly OpcionPaginable[],
  ):
    | { ids: string[]; sinReconocer: string[] }
    | null
    | Promise<{ ids: string[]; sinReconocer: string[] } | null>;
  /** Aviso cuando `interpretarTexto` no reconoció nada del texto escrito. */
  avisoTextoNoReconocido?: string;
}

/**
 * Selección de varios elementos de una lista, con toggle y paginación.
 *
 * Cada opción es su propio botón; tocarlo prende o apaga una marca (✅) sin
 * cambiar de paso, y "Listo" confirma. Los ids que entrega `obtenerOpciones`
 * viajan tal cual como id de botón —igual que `pasoSelectorEquipo`—, así que
 * no hay ventana de carrera por índices posicionales: paginar o que la lista
 * cambie entre toques no corre lo ya marcado.
 *
 * Cada toque edita el mismo mensaje en vez de mandar uno nuevo — con una
 * plantilla de 15 jugadores, marcar la titular a los golpes no puede dejar 15
 * mensajes en el chat. "Todos"/"Ninguno" y el atajo por texto (si el paso lo
 * ofrece) existen por la misma razón: menos toques para el caso común.
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
    const { botones } = botonesPaginados(marcadas, pagina, RESERVA_BOTONES_FIJOS);

    botones.push(
      { id: ID_TODOS, texto: textos.todos },
      { id: ID_NINGUNO, texto: textos.ninguno },
      {
        id: ID_CONFIRMAR,
        texto: `${opciones.textoConfirmar ?? textos.confirmarListo} (${elegidos.length})`,
      },
    );

    return {
      texto: [aviso, opciones.pregunta].filter(Boolean).join('\n\n'),
      botones,
    };
  };

  /** Repite el paso editando el mensaje que traía el botón (o mandando uno
   * nuevo, si la entrada fue texto y no hay nada que editar). */
  const repetir = (
    ctx: ContextoFlujo,
    lista: readonly OpcionPaginable[],
    elegidos: readonly string[],
    pagina: number,
    aviso?: string,
  ): { respuesta: RespuestaBot } => ({
    respuesta: {
      ...armar(lista, elegidos, pagina, aviso),
      editarMensajeId: ctx.mensaje.mensajeOrigenId,
    },
  });

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
        const siguiente = paginaSiguiente(pagina, lista.length, RESERVA_BOTONES_FIJOS);

        return {
          tipo: 'repetir',
          ...repetir(ctx, lista, elegidos, siguiente),
          datos: { [CLAVE_PAGINA]: siguiente },
        };
      }

      if (seleccion === ID_TODOS) {
        const todos = lista.map((o) => o.id);

        return {
          tipo: 'repetir',
          ...repetir(ctx, lista, todos, pagina),
          datos: { [CLAVE_SELECCION]: todos },
        };
      }

      if (seleccion === ID_NINGUNO) {
        return {
          tipo: 'repetir',
          ...repetir(ctx, lista, [], pagina),
          datos: { [CLAVE_SELECCION]: [] },
        };
      }

      if (seleccion === ID_CONFIRMAR) {
        if (elegidos.length < minimo) {
          return {
            tipo: 'repetir',
            ...repetir(ctx, lista, elegidos, pagina, textos.eligeAlMenos(minimo)),
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
          ...repetir(ctx, lista, nuevos, pagina),
          datos: { [CLAVE_SELECCION]: nuevos },
        };
      }

      // Nada de botón: si el paso ofrece un atajo por texto, se prueba acá.
      // Reemplaza la selección entera — escribir es "elegí esto", no "sumá
      // esto a lo que ya tenía marcado".
      const escrito = ctx.mensaje.texto?.trim();

      if (escrito && opciones.interpretarTexto) {
        const resultado = await opciones.interpretarTexto(ctx, escrito, lista);

        if (resultado) {
          // Coincidencia parcial: se aplica lo que sí matcheó, pero se avisa
          // de lo que no — sin esto, un typo en un dorsal se colaba sin que
          // nadie se enterara de que faltó alguien.
          const aviso =
            resultado.sinReconocer.length > 0
              ? textos.avisoParcial(resultado.sinReconocer)
              : undefined;

          return {
            tipo: 'repetir',
            ...repetir(ctx, lista, resultado.ids, pagina, aviso),
            datos: { [CLAVE_SELECCION]: resultado.ids },
          };
        }

        return {
          tipo: 'repetir',
          ...repetir(
            ctx,
            lista,
            elegidos,
            pagina,
            opciones.avisoTextoNoReconocido ?? textos.textoNoReconocido,
          ),
        };
      }

      return { tipo: 'repetir', ...repetir(ctx, lista, elegidos, pagina) };
    },
  };
}
