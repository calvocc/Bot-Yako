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
 * Elige la representación según cuántas opciones haya, y devuelve los
 * mensajes a mandar en orden.
 *
 * Un grupo de más de 3 botones se convierte en lista automáticamente. Más
 * de 10 opciones —el panel en vivo, una plantilla completa— no entran en
 * una sola lista de WhatsApp, así que se reparten en varias listas
 * seguidas: el bot ya no pagina en los flujos (Telegram muestra todo de
 * una), y es este canal el que tiene que adaptarse. Los ids viajan intactos
 * y son estables —nunca posicionales—, así que el flujo acepta la opción
 * venga de la lista que venga, sin guardar en qué página se estaba.
 */
export function renderizarParaWhatsApp(
  respuesta: RespuestaBot,
  opciones: OpcionesRender = {},
): MensajeWhatsApp[] {
  const botones = respuesta.botones ?? [];

  if (botones.length === 0) {
    return [{ tipo: 'texto', cuerpo: respuesta.texto }];
  }

  if (botones.length <= MAX_BOTONES_RESPUESTA) {
    return [
      {
        tipo: 'botones',
        cuerpo: respuesta.texto,
        botones: botones.map((boton) => ({
          id: boton.id,
          titulo: recortar(boton.texto, MAX_CARACTERES_ROTULO_BOTON),
        })),
      },
    ];
  }

  const rotuloBoton = recortar(opciones.rotuloLista ?? 'Ver opciones', MAX_CARACTERES_ROTULO_BOTON);
  const partes = Math.ceil(botones.length / MAX_FILAS_LISTA);
  const mensajes: MensajeWhatsApp[] = [];

  for (let parte = 0; parte < partes; parte++) {
    mensajes.push({
      tipo: 'lista',
      // El cuerpo es obligatorio en una lista: las que siguen a la primera
      // solo dicen que continúan, sin repetir la pregunta.
      cuerpo: parte === 0 ? respuesta.texto : `Más opciones (${parte + 1}/${partes})`,
      rotuloBoton,
      filas: botones.slice(parte * MAX_FILAS_LISTA, (parte + 1) * MAX_FILAS_LISTA).map((boton) => ({
        id: boton.id,
        titulo: recortar(boton.texto, MAX_CARACTERES_TITULO_FILA),
      })),
    });
  }

  return mensajes;
}

/** Avisa de rótulos que WhatsApp truncaría, para detectarlos en desarrollo. */
export function rotulosDemasiadoLargos(botones: Boton[]): Boton[] {
  return botones.filter((boton) => boton.texto.length > MAX_CARACTERES_ROTULO_BOTON);
}

function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}
