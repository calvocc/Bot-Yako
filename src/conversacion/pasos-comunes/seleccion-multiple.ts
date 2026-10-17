import type { Boton, RespuestaBot } from '../../channels/channel.types';
import { textos } from '../../textos/pasos-comunes';
import type { ContextoFlujo, DatosFlujo, Entrada, Paso, Transicion } from '../flow.types';
import { botonesDeOpciones, type OpcionLista } from './opciones';

const CLAVE_SELECCION = 'seleccionMultiple';
const ID_CONFIRMAR = 'sm:listo';
const ID_TODOS = 'sm:todos';
const ID_NINGUNO = 'sm:ninguno';
const ID_VOLVER = 'sm:volver';

export interface OpcionesSeleccionMultiple {
  /** Texto de la pregunta, arriba de la lista; puede depender de los datos del flujo. */
  pregunta: string | ((ctx: ContextoFlujo) => string);
  /** Las opciones para esta visita al paso — ids estables, no posicionales. */
  obtenerOpciones(ctx: ContextoFlujo): Promise<OpcionLista[]>;
  /** Qué hacer con los ids elegidos al confirmar. */
  alConfirmar(ctx: ContextoFlujo, elegidos: string[]): Promise<Transicion>;
  /**
   * Lo que aparece ya marcado al entrar (por ejemplo, quiénes jugaron, para
   * corregirlo). Por defecto, nada.
   */
  seleccionInicial?(ctx: ContextoFlujo): Promise<string[]>;
  /**
   * Si se da, agrega "↩️ Volver" para salir sin confirmar —sin esto, la
   * única salida es "Listo", que guarda—.
   */
  alVolver?(ctx: ContextoFlujo): Transicion | Promise<Transicion>;
  /** Mínimo para poder confirmar. Por defecto 1: no tiene sentido un mínimo de 0. */
  minimo?: number;
  /** Rótulo del botón de confirmar, sin el conteo — por defecto "Listo". */
  textoConfirmar?: string;
  /** Qué decir si `obtenerOpciones` no tiene nada para ofrecer. */
  sinOpciones?: string;
  /**
   * Si además de "Todos" hay que ofrecer "Ninguno" (vaciar la selección),
   * junto a él al final de la lista. Por defecto no: para la titular, por
   * ejemplo, no vale la pena el lugar que le saca a un jugador más visible
   * por página.
   */
  mostrarNinguno?: boolean;
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
    lista: readonly OpcionLista[],
  ):
    | { ids: string[]; sinReconocer: string[] }
    | null
    | Promise<{ ids: string[]; sinReconocer: string[] } | null>;
  /** Aviso cuando `interpretarTexto` no reconoció nada del texto escrito. */
  avisoTextoNoReconocido?: string;
}

/**
 * Selección de varios elementos de una lista, con toggle, sin paginar.
 *
 * Cada opción es su propio botón; tocarlo prende o apaga una marca (✅) sin
 * cambiar de paso, y "Listo" confirma. Los ids que entrega `obtenerOpciones`
 * viajan tal cual como id de botón —igual que `pasoSelectorEquipo`—, así que
 * no hay ventana de carrera por índices posicionales: que la lista cambie
 * entre toques no corre lo ya marcado.
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
    ctx: ContextoFlujo,
    lista: readonly OpcionLista[],
    elegidos: readonly string[],
    aviso?: string,
  ): { texto: string; botones: Boton[] } => {
    const marcadas = lista.map((o) => ({
      id: o.id,
      texto: elegidos.includes(o.id) ? textos.marcaSeleccionado(o.texto) : o.texto,
    }));
    const botones = botonesDeOpciones(marcadas);

    botones.push({ id: ID_TODOS, texto: textos.todos });

    if (opciones.mostrarNinguno) {
      botones.push({ id: ID_NINGUNO, texto: textos.ninguno });
    }

    botones.push({
      id: ID_CONFIRMAR,
      texto: `${opciones.textoConfirmar ?? textos.confirmarListo} (${elegidos.length})`,
    });

    if (opciones.alVolver) {
      botones.push({ id: ID_VOLVER, texto: '↩️ Volver' });
    }

    return {
      texto: [
        aviso,
        typeof opciones.pregunta === 'string' ? opciones.pregunta : opciones.pregunta(ctx),
      ]
        .filter(Boolean)
        .join('\n\n'),
      botones,
    };
  };

  /** Repite el paso editando el mensaje que traía el botón (o mandando uno
   * nuevo, si la entrada fue texto y no hay nada que editar). */
  const repetir = (
    ctx: ContextoFlujo,
    lista: readonly OpcionLista[],
    elegidos: readonly string[],
    aviso?: string,
  ): { respuesta: RespuestaBot } => ({
    respuesta: {
      ...armar(ctx, lista, elegidos, aviso),
      editarMensajeId: ctx.mensaje.mensajeOrigenId,
    },
  });

  return {
    id,

    entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
      // Un mismo flujo puede usar este paso genérico más de una vez con
      // datos distintos (ver `cargar.flujo.ts`: `pasoTitulares` y
      // `pasoParticipantesPost` comparten esta clave de sesión). Sin
      // limpiarla acá, una selección que quedó de la visita anterior se
      // cuela como si el usuario ya la hubiera marcado en esta -- aunque
      // acá se muestre otra cosa. Se arranca de `seleccionInicial` (o de
      // nada) y se muta `ctx.datos` directo (no alcanza con `armar`, que
      // solo arma la respuesta): `FlowEngine` relee `ctx.datos` después de
      // `entrar`, así que mutarlo es lo que hace que quede guardada.
      const lista = await opciones.obtenerOpciones(ctx);
      const inicial = opciones.seleccionInicial
        ? (await opciones.seleccionInicial(ctx)).filter((id) => lista.some((o) => o.id === id))
        : [];

      ctx.datos[CLAVE_SELECCION] = inicial;

      if (lista.length === 0 && opciones.sinOpciones) {
        return {
          transicion: { tipo: 'finalizar', respuesta: { texto: opciones.sinOpciones } },
        };
      }

      return { respuesta: armar(ctx, lista, inicial) };
    },

    recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
      const seleccion = ctx.mensaje.seleccionId ?? '';

      if (seleccion === ID_VOLVER && opciones.alVolver) return opciones.alVolver(ctx);

      const lista = await opciones.obtenerOpciones(ctx);
      const elegidos = leerSeleccion(ctx.datos);

      if (seleccion === ID_TODOS) {
        const todos = lista.map((o) => o.id);

        return {
          tipo: 'repetir',
          ...repetir(ctx, lista, todos),
          datos: { [CLAVE_SELECCION]: todos },
        };
      }

      if (seleccion === ID_NINGUNO) {
        return {
          tipo: 'repetir',
          ...repetir(ctx, lista, []),
          datos: { [CLAVE_SELECCION]: [] },
        };
      }

      if (seleccion === ID_CONFIRMAR) {
        if (elegidos.length < minimo) {
          return {
            tipo: 'repetir',
            ...repetir(ctx, lista, elegidos, textos.eligeAlMenos(minimo)),
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
          ...repetir(ctx, lista, nuevos),
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
            ...repetir(ctx, lista, resultado.ids, aviso),
            datos: { [CLAVE_SELECCION]: resultado.ids },
          };
        }

        return {
          tipo: 'repetir',
          ...repetir(
            ctx,
            lista,
            elegidos,
            opciones.avisoTextoNoReconocido ?? textos.textoNoReconocido,
          ),
        };
      }

      return { tipo: 'repetir', ...repetir(ctx, lista, elegidos) };
    },
  };
}
