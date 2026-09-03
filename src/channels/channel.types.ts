/**
 * Modelo de mensajeria neutral.
 *
 * Es el unico vocabulario que conocen el motor de flujos y los servicios de
 * dominio. Nada de aca menciona a Telegram ni a WhatsApp: traducir entre este
 * modelo y el protocolo de cada plataforma es responsabilidad exclusiva de los
 * adaptadores en `channels/<canal>/`.
 */

export const CANALES = ['telegram', 'whatsapp'] as const;
export type Canal = (typeof CANALES)[number];

/** Un mensaje que llego de cualquier canal, ya normalizado. */
export interface MensajeEntrante {
  canal: Canal;
  /** Telegram: el user id como texto. WhatsApp: el numero en E.164. */
  canalUserId: string;
  /** A donde se responde. */
  chatId: string;
  /** Nombre para mostrar que reporta el canal. */
  nombre: string;
  /** Texto libre o comando. Ausente si el usuario solo pulso un boton. */
  texto?: string;
  /** Id del boton pulsado. Ausente si el usuario escribio. */
  seleccionId?: string;
  /** Mensaje que traia el boton, para poder editarlo en vez de mandar otro. */
  mensajeOrigenId?: string;
  /**
   * Token para acusar recibo de la interaccion. En Telegram es el id del
   * callback query; en canales sin ese concepto no viene.
   */
  acuseId?: string;
  recibidoEn: Date;
}

/**
 * Un boton.
 *
 * `id` viaja de ida y vuelta por el canal, asi que tiene un limite duro: el
 * callback_data de Telegram admite 64 bytes. `texto` se limita a 20 caracteres
 * porque es lo que aceptan los botones de WhatsApp; respetarlo desde el
 * principio evita descubrir en la Fase 5 que hay que reescribir cada rotulo.
 */
export interface Boton {
  id: string;
  texto: string;
}

export const LIMITE_BYTES_ID_BOTON = 64;
export const LIMITE_CARACTERES_TEXTO_BOTON = 20;

export interface RespuestaBot {
  texto: string;
  /**
   * Los flujos declaran los botones sin pensar en el canal. Cada adaptador
   * decide como mostrarlos: Telegram arma un inline keyboard; WhatsApp usa
   * botones hasta 3 y convierte a lista desplegable cuando hay mas.
   */
  botones?: Boton[];
  /**
   * Si viene, se actualiza ese mensaje en vez de enviar uno nuevo. Es lo que
   * mantiene vivo el panel del partido sin llenar el chat. Un canal que no
   * sepa editar (WhatsApp) simplemente envia uno nuevo.
   */
  editarMensajeId?: string;
}

export interface DestinoMensaje {
  canal: Canal;
  chatId: string;
}

export interface MensajeEnviado {
  mensajeId: string;
}

/** Identifica a una persona dentro de un canal. */
export interface ReferenciaCanal {
  canal: Canal;
  canalUserId: string;
}

export function claveReferencia(ref: ReferenciaCanal): string {
  return `${ref.canal}:${ref.canalUserId}`;
}

export function esCanalConocido(valor: string): valor is Canal {
  return (CANALES as readonly string[]).includes(valor);
}
