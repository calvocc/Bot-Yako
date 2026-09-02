import type { ChannelAdapter } from '../channel-adapter.interface';
import type {
  Boton,
  Canal,
  DestinoMensaje,
  MensajeEntrante,
  MensajeEnviado,
  RespuestaBot,
} from '../channel.types';

export interface EnvioCapturado {
  destino: DestinoMensaje;
  respuesta: RespuestaBot;
  mensajeId: string;
  fueEdicion: boolean;
}

/**
 * Adaptador de pruebas: en lugar de hablar con una plataforma, guarda lo que se
 * habría enviado.
 *
 * Es lo que permite ejercitar una conversación entera —incluidos los casos de
 * concurrencia— sin bot real, sin red y de forma determinista.
 */
export class FakeChannelAdapter implements ChannelAdapter {
  readonly enviados: EnvioCapturado[] = [];
  readonly acuses: string[] = [];

  private contador = 0;

  constructor(readonly canal: Canal = 'telegram') {}

  enviar(destino: DestinoMensaje, respuesta: RespuestaBot): Promise<MensajeEnviado> {
    const mensajeId = respuesta.editarMensajeId ?? String(++this.contador);

    this.enviados.push({
      destino,
      respuesta,
      mensajeId,
      fueEdicion: Boolean(respuesta.editarMensajeId),
    });

    return Promise.resolve({ mensajeId });
  }

  acusarRecibo(acuseId: string): Promise<void> {
    this.acuses.push(acuseId);
    return Promise.resolve();
  }

  // --- Ayudas para escribir aserciones legibles ---

  get ultimo(): EnvioCapturado {
    const ultimo = this.enviados.at(-1);

    if (!ultimo) {
      throw new Error('No se envió ningún mensaje');
    }

    return ultimo;
  }

  get ultimoTexto(): string {
    return this.ultimo.respuesta.texto;
  }

  get ultimosBotones(): Boton[] {
    return this.ultimo.respuesta.botones ?? [];
  }

  limpiar(): void {
    this.enviados.length = 0;
    this.acuses.length = 0;
  }
}

let secuenciaMensajes = 0;

/** Construye un mensaje entrante de prueba. */
export function mensajeDePrueba(parcial: Partial<MensajeEntrante> = {}): MensajeEntrante {
  return {
    canal: 'telegram',
    canalUserId: '1001',
    chatId: '1001',
    nombre: 'Carlos',
    mensajeOrigenId: String(++secuenciaMensajes),
    recibidoEn: new Date(),
    ...parcial,
  };
}

export function textoDePrueba(texto: string, parcial: Partial<MensajeEntrante> = {}) {
  return mensajeDePrueba({ texto, ...parcial });
}

export function seleccionDePrueba(seleccionId: string, parcial: Partial<MensajeEntrante> = {}) {
  return mensajeDePrueba({ seleccionId, acuseId: `cb-${seleccionId}`, ...parcial });
}
