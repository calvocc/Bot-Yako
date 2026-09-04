import type { MensajeEntrante, RespuestaBot } from '../channels/channel.types';
import { parsearComando } from '../conversacion/comandos';
import type { ContextoFlujo, Entrada, Paso, Transicion } from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import type { EquiposService } from '../equipos/equipos.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/jugadores';
import { DorsalOcupadoError, describirJugador, parsearPlantilla } from './jugadores.service';
import type { Jugador, JugadoresService } from './jugadores.service';

export const CLAVE_ALTAS = 'jugadoresCargados';

const COMANDO_LISTO = '/listo';

/**
 * Reconoce el fin de carga con el mismo parser que usa el router, que quita el
 * `@NombreDelBot` que Telegram agrega en los grupos.
 */
function esComandoDeTerminar(texto: string): boolean {
  const comando = parsearComando({ texto } as MensajeEntrante);

  return comando?.nombre === COMANDO_LISTO.slice(1);
}

export interface OpcionesPasoPlantilla {
  /** De dónde sale el equipo al que se cargan los jugadores. */
  claveEquipoId: string;
  /** Qué hacer cuando el usuario termina. */
  alTerminar: (ctx: ContextoFlujo, cargados: number) => Transicion;
  /**
   * Se consulta antes de cada lote. La sesión dura una hora y el teclado sigue
   * ahí: sin esto, alguien a quien le revocaron el rol podría seguir cargando.
   * Los flujos que acaban de crear el equipo no lo necesitan — su creador es
   * admin por construcción.
   */
  puedeEscribir?: (ctx: ContextoFlujo) => Promise<boolean>;
}

/**
 * Carga de plantilla: acepta un jugador por mensaje o una lista pegada de una
 * vez, y termina con /listo.
 *
 * Aceptar varias líneas de golpe importa más de lo que parece: la plantilla
 * suele existir ya en una nota o un chat, y obligar a teclear veinte nombres
 * de a uno es la clase de fricción que hace que nadie cargue nada.
 */
export function pasoCargarPlantilla(
  id: string,
  jugadores: JugadoresService,
  equipos: EquiposService,
  opciones: OpcionesPasoPlantilla,
): Paso {
  const { claveEquipoId, alTerminar, puedeEscribir } = opciones;

  return {
    id,

    entrar(): Promise<Entrada> {
      return Promise.resolve({
        respuesta: { texto: textos.cargarPlantilla.instrucciones(COMANDO_LISTO) },
      });
    },

    async recibir(ctx: ContextoFlujo): Promise<Transicion> {
      const texto = ctx.mensaje.texto?.trim() ?? '';
      const yaCargados = leerNumero(ctx.datos, CLAVE_ALTAS);

      if (esComandoDeTerminar(texto)) {
        return alTerminar(ctx, yaCargados);
      }

      // Cualquier otra cosa con barra es un comando, no el nombre de nadie.
      // Sin esto, "/listo@YakoBot" en un grupo se guardaba como jugador y no
      // había forma de salir del paso.
      if (texto.startsWith('/')) {
        return {
          tipo: 'repetir',
          respuesta: { texto: textos.cargarPlantilla.esComando(COMANDO_LISTO) },
        };
      }

      if (puedeEscribir && !(await puedeEscribir(ctx))) {
        return {
          tipo: 'finalizar',
          respuesta: { texto: textosComunes.sinPermisoPara('editar esta plantilla') },
        };
      }

      const equipoId = leerTexto(ctx.datos, claveEquipoId);
      const parseados = parsearPlantilla(texto);

      if (parseados.length === 0) {
        return {
          tipo: 'repetir',
          respuesta: { texto: textos.cargarPlantilla.noEntendido(COMANDO_LISTO) },
        };
      }

      // Se busca la academia una vez por lote, no por jugador: es la misma
      // para todos los nombres de este mensaje.
      const equipo = await equipos.obtener(equipoId);
      const { agregados, problemas, avisos } = await altaEnLote(
        jugadores,
        equipoId,
        equipo?.academiaId,
        parseados,
      );
      const total = yaCargados + agregados.length;

      return {
        tipo: 'repetir',
        respuesta: { texto: resumenDeAlta(agregados, problemas, avisos, total) },
        datos: { [CLAVE_ALTAS]: total },
      };
    },
  };
}

async function altaEnLote(
  jugadores: JugadoresService,
  equipoId: string,
  academiaId: string | undefined,
  parseados: ReturnType<typeof parsearPlantilla>,
): Promise<{ agregados: string[]; problemas: string[]; avisos: string[] }> {
  const agregados: string[] = [];
  const problemas: string[] = [];
  const avisos: string[] = [];

  for (const jugador of parseados) {
    let creado: Jugador;

    try {
      creado = await jugadores.crear(equipoId, jugador.nombre, jugador.dorsal);
      agregados.push(describirJugador(creado));
    } catch (error) {
      // Un dorsal repetido no debe abortar el resto del lote: se informa y se
      // sigue, que es lo que espera quien pegó una lista de veinte.
      problemas.push(
        error instanceof DorsalOcupadoError
          ? `${jugador.nombre}: ${error.message}`
          : `${jugador.nombre}: no se pudo agregar`,
      );
      continue;
    }

    // Aviso, no bloqueo: quien pega una lista de veinte no puede confirmar
    // uno por uno si son la misma persona. Se avisa y se deja para arreglar
    // a mano con "Agregar" → "Ya juega en otro equipo de la academia", que sí
    // pregunta antes de vincular.
    if (academiaId) {
      const candidatos = await jugadores.buscarEnAcademia(academiaId, jugador.nombre, equipoId);

      if (candidatos.length > 0) {
        avisos.push(
          textos.cargarPlantilla.posibleDuplicado(creado.nombre, candidatos[0].equipoNombre),
        );
      }
    }
  }

  return { agregados, problemas, avisos };
}

function resumenDeAlta(
  agregados: string[],
  problemas: string[],
  avisos: string[],
  total: number,
): string {
  const lineas: string[] = [];

  if (agregados.length > 0) {
    lineas.push(`✅ ${agregados.join(', ')}`);
  }

  if (problemas.length > 0) {
    lineas.push(`⚠️ ${problemas.join(' · ')}`);
  }

  if (avisos.length > 0) {
    lineas.push(...avisos.map((aviso) => `❓ ${aviso}`));
  }

  lineas.push('', textos.cargarPlantilla.resumenAlta(total, COMANDO_LISTO));

  return lineas.join('\n');
}

export function respuestaPlantillaLista(cargados: number, siguiente: string): RespuestaBot {
  return { texto: textos.cargarPlantilla.listaLista(cargados, siguiente) };
}
