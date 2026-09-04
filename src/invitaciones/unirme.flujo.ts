import { Injectable } from '@nestjs/common';
import type { ContextoComando } from '../conversacion/router.service';
import type { RespuestaBot } from '../channels/channel.types';
import type { Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/invitaciones';
import { InvitacionesService } from './invitaciones.service';
import { mensajeDeCanje } from './mensajes-canje';

export const FLUJO_UNIRME = 'unirme';
const PASO_CODIGO = 'codigo';

@Injectable()
export class UnirmeFlujo {
  constructor(private readonly invitaciones: InvitacionesService) {}

  construir(): Flujo {
    return { id: FLUJO_UNIRME, pasoInicial: PASO_CODIGO, pasos: [this.pasoCodigo()] };
  }

  /** `/unirme YAKO-X7F2A` resuelve de una, sin abrir el flujo. */
  async manejarDirecto(ctx: ContextoComando, usuarioId?: string): Promise<RespuestaBot | null> {
    if (!ctx.argumento || !usuarioId) return null;

    return (await this.canjear(ctx.argumento, usuarioId)).respuesta;
  }

  private pasoCodigo(): Paso {
    return {
      id: PASO_CODIGO,

      entrar: () =>
        Promise.resolve({
          respuesta: { texto: textos.unirme.pedirCodigo() },
        }),

      recibir: async (ctx): Promise<Transicion> => {
        const codigo = ctx.mensaje.texto?.trim();

        if (!codigo || !ctx.usuarioId) {
          return {
            tipo: 'repetir',
            respuesta: { texto: textosComunes.necesitoElCodigo() },
          };
        }

        const { exitoso, respuesta } = await this.canjear(codigo, ctx.usuarioId);

        // Un código inválido deja el flujo abierto para reintentar; uno
        // válido lo cierra. Se decide por `resultado.estado` (tipado), no
        // por el texto ya renderizado: comparar substrings del mensaje se
        // rompe en silencio en cuanto alguien reescribe el copy.
        return exitoso ? { tipo: 'finalizar', respuesta } : { tipo: 'repetir', respuesta };
      },
    };
  }

  private async canjear(
    codigo: string,
    usuarioId: string,
  ): Promise<{ exitoso: boolean; respuesta: RespuestaBot }> {
    // El canje ya deja la membresía aplicada, en su misma transacción.
    const resultado = await this.invitaciones.canjear(codigo, usuarioId);

    return {
      exitoso: resultado.estado === 'ok' || resultado.estado === 'ya_eras_miembro',
      respuesta: mensajeDeCanje(resultado),
    };
  }
}
