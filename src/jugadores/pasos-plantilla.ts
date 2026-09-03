import type { RespuestaBot } from '../channels/channel.types';
import type { ContextoFlujo, Entrada, Paso, Transicion } from '../conversacion/flow.types';
import { leerNumero, leerTexto } from '../conversacion/flow.types';
import { DorsalOcupadoError, describirJugador, parsearPlantilla } from './jugadores.service';
import type { JugadoresService } from './jugadores.service';

export const CLAVE_ALTAS = 'jugadoresCargados';

const COMANDO_LISTO = '/listo';

export interface OpcionesPasoPlantilla {
  /** De dónde sale el equipo al que se cargan los jugadores. */
  claveEquipoId: string;
  /** Qué hacer cuando el usuario termina. */
  alTerminar: (ctx: ContextoFlujo, cargados: number) => Transicion;
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
  opciones: OpcionesPasoPlantilla,
): Paso {
  const { claveEquipoId, alTerminar } = opciones;

  return {
    id,

    entrar(): Promise<Entrada> {
      return Promise.resolve({
        respuesta: {
          texto: [
            'Ahora carga la plantilla. Escribe *nombre y dorsal*, así:',
            '',
            'Jacob, 10',
            '',
            'Puedes mandar varios de una vez, uno por línea.',
            `Cuando termines, escribe ${COMANDO_LISTO}.`,
          ].join('\n'),
        },
      });
    },

    async recibir(ctx: ContextoFlujo): Promise<Transicion> {
      const texto = ctx.mensaje.texto?.trim() ?? '';
      const yaCargados = leerNumero(ctx.datos, CLAVE_ALTAS);

      if (texto.toLowerCase() === COMANDO_LISTO) {
        return alTerminar(ctx, yaCargados);
      }

      const equipoId = leerTexto(ctx.datos, claveEquipoId);
      const parseados = parsearPlantilla(texto);

      if (parseados.length === 0) {
        return {
          tipo: 'repetir',
          respuesta: {
            texto: `No entendí eso. Escribe algo como "Jacob, 10", o ${COMANDO_LISTO} para terminar.`,
          },
        };
      }

      const { agregados, problemas } = await altaEnLote(jugadores, equipoId, parseados);
      const total = yaCargados + agregados.length;

      return {
        tipo: 'repetir',
        respuesta: { texto: resumenDeAlta(agregados, problemas, total) },
        datos: { [CLAVE_ALTAS]: total },
      };
    },
  };
}

async function altaEnLote(
  jugadores: JugadoresService,
  equipoId: string,
  parseados: ReturnType<typeof parsearPlantilla>,
): Promise<{ agregados: string[]; problemas: string[] }> {
  const agregados: string[] = [];
  const problemas: string[] = [];

  for (const jugador of parseados) {
    try {
      const creado = await jugadores.crear(equipoId, jugador.nombre, jugador.dorsal);
      agregados.push(describirJugador(creado));
    } catch (error) {
      // Un dorsal repetido no debe abortar el resto del lote: se informa y se
      // sigue, que es lo que espera quien pegó una lista de veinte.
      problemas.push(
        error instanceof DorsalOcupadoError
          ? `${jugador.nombre}: ${error.message}`
          : `${jugador.nombre}: no se pudo agregar`,
      );
    }
  }

  return { agregados, problemas };
}

function resumenDeAlta(agregados: string[], problemas: string[], total: number): string {
  const lineas: string[] = [];

  if (agregados.length > 0) {
    lineas.push(`✅ ${agregados.join(', ')}`);
  }

  if (problemas.length > 0) {
    lineas.push(`⚠️ ${problemas.join(' · ')}`);
  }

  lineas.push(
    '',
    `Van ${total} jugador${total === 1 ? '' : 'es'}. Sigue o escribe ${COMANDO_LISTO}.`,
  );

  return lineas.join('\n');
}

export function respuestaPlantillaLista(cargados: number, siguiente: string): RespuestaBot {
  return {
    texto:
      cargados === 0
        ? `Sin jugadores por ahora. Puedes cargarlos después con /plantilla.\n\n${siguiente}`
        : `Plantilla lista con ${cargados} jugador${cargados === 1 ? '' : 'es'}. ✅\n\n${siguiente}`,
  };
}
