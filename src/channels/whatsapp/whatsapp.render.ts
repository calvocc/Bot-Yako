import type { Boton, RespuestaBot } from '../channel.types';

/**
 * Traducción de una RespuestaBot al formato interactivo de WhatsApp Cloud API.
 *
 * Está escrita y probada ahora, aunque el canal se implemente más adelante,
 * porque es donde se verifica la afirmación central del diseño multicanal: que
 * un flujo pensado para Telegram funciona en WhatsApp sin tocarlo.
 *
 * Los límites son de la plataforma, no elegidos por nosotros:
 *  - hasta 3 botones de respuesta rápida por mensaje;
 *  - hasta 10 filas en un mensaje de lista;
 *  - 20 caracteres en el rótulo de un botón, 24 en el título de una fila;
 *  - 256 bytes en el id que viaja de ida y vuelta.
 */
export const MAX_BOTONES_RESPUESTA = 3;
export const MAX_FILAS_LISTA = 10;
export const MAX_CARACTERES_ROTULO_BOTON = 20;
export const MAX_CARACTERES_TITULO_FILA = 24;

export type MensajeWhatsApp =
  | { tipo: 'texto'; cuerpo: string }
  | { tipo: 'botones'; cuerpo: string; botones: { id: string; titulo: string }[] }
  | {
      tipo: 'lista';
      cuerpo: string;
      rotuloBoton: string;
      filas: { id: string; titulo: string }[];
    };

export interface OpcionesRender {
  /** Rótulo del botón que despliega la lista. */
  rotuloLista?: string;
}

/**
 * Elige la representación según cuántas opciones haya.
 *
 * Un grupo de más de 3 botones se convierte en lista automáticamente, así que
 * el panel del partido en vivo —que tiene 8— sigue siendo usable en WhatsApp
 * sin recortar la experiencia en Telegram, donde los 8 se muestran de una.
 */
export function renderizarParaWhatsApp(
  respuesta: RespuestaBot,
  opciones: OpcionesRender = {},
): MensajeWhatsApp {
  const botones = respuesta.botones ?? [];

  if (botones.length === 0) {
    return { tipo: 'texto', cuerpo: respuesta.texto };
  }

  if (botones.length <= MAX_BOTONES_RESPUESTA) {
    return {
      tipo: 'botones',
      cuerpo: respuesta.texto,
      botones: botones.map((boton) => ({
        id: boton.id,
        titulo: recortar(boton.texto, MAX_CARACTERES_ROTULO_BOTON),
      })),
    };
  }

  if (botones.length > MAX_FILAS_LISTA) {
    // Un flujo que ofrece más de 10 opciones no se puede mostrar en WhatsApp
    // de una sola vez. Es un problema de diseño del flujo (hay que paginar),
    // no algo que el adaptador pueda resolver escondiendo opciones.
    throw new Error(
      `WhatsApp admite hasta ${MAX_FILAS_LISTA} opciones por mensaje y este flujo ofrece ` +
        `${botones.length}. Hay que paginarlas en el flujo.`,
    );
  }

  return {
    tipo: 'lista',
    cuerpo: respuesta.texto,
    rotuloBoton: recortar(opciones.rotuloLista ?? 'Ver opciones', MAX_CARACTERES_ROTULO_BOTON),
    filas: botones.map((boton) => ({
      id: boton.id,
      titulo: recortar(boton.texto, MAX_CARACTERES_TITULO_FILA),
    })),
  };
}

/** Avisa de rótulos que WhatsApp truncaría, para detectarlos en desarrollo. */
export function rotulosDemasiadoLargos(botones: Boton[]): Boton[] {
  return botones.filter((boton) => boton.texto.length > MAX_CARACTERES_ROTULO_BOTON);
}

function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}
