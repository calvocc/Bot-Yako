import type {
  ComandoDeMenu,
  DestinoMensaje,
  Canal,
  MensajeEnviado,
  RespuestaBot,
} from './channel.types';

/**
 * Puerto de salida hacia un canal de mensajeria.
 *
 * Implementarlo es todo lo que hace falta para sumar un canal: ningun flujo ni
 * servicio de dominio cambia.
 */
export interface ChannelAdapter {
  readonly canal: Canal;

  /** Envia (o edita, si `respuesta.editarMensajeId` viene) un mensaje. */
  enviar(destino: DestinoMensaje, respuesta: RespuestaBot): Promise<MensajeEnviado>;

  /**
   * Acusa recibo de una interaccion para que el usuario vea de inmediato que
   * su toque llego, antes de que termine el trabajo real. Es lo que sostiene
   * el objetivo de <2s durante un partido en vivo.
   *
   * En canales sin este concepto es un no-op.
   */
  acusarRecibo(acuseId: string, texto?: string): Promise<void>;

  /**
   * Refresca el menú nativo del canal para ESE chat puntual, con los
   * comandos que le corresponden ahora a quien lo usa (`RespuestaBot.actualizarMenu`,
   * via `ProcesadorMensajes`). Opcional: solo Telegram tiene este concepto de
   * menú por chat (`setMyCommands` con `scope: 'chat'`); WhatsApp no lo
   * implementa.
   */
  actualizarMenu?(destino: DestinoMensaje, comandos: readonly ComandoDeMenu[]): Promise<void>;
}

/** Token de inyeccion para la lista de adaptadores registrados. */
export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
