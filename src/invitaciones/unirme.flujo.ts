import { Injectable } from '@nestjs/common';
import type { ContextoComando } from '../conversacion/router.service';
import type { RespuestaBot } from '../channels/channel.types';
import type { Flujo, Paso, Transicion } from '../conversacion/flow.types';
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

    return this.canjearYResponder(ctx.argumento, usuarioId);
  }

  private pasoCodigo(): Paso {
    return {
      id: PASO_CODIGO,

      entrar: () =>
        Promise.resolve({
          respuesta: { texto: 'Pega el código del equipo al que te quieres sumar.' },
        }),

      recibir: async (ctx): Promise<Transicion> => {
        const codigo = ctx.mensaje.texto?.trim();

        if (!codigo || !ctx.usuarioId) {
          return {
            tipo: 'repetir',
            respuesta: { texto: 'Necesito el código. Se ve así: YAKO-X7F2A' },
          };
        }

        const respuesta = await this.canjearYResponder(codigo, ctx.usuarioId);
        const exitoso = respuesta.texto.includes('✅') || respuesta.texto.includes('Ya eras');

        // Un código inválido deja el flujo abierto para reintentar; uno válido
        // lo cierra.
        return exitoso ? { tipo: 'finalizar', respuesta } : { tipo: 'repetir', respuesta };
      },
    };
  }

  private async canjearYResponder(codigo: string, usuarioId: string): Promise<RespuestaBot> {
    const resultado = await this.invitaciones.canjear(codigo, usuarioId);

    if (resultado.estado === 'ok') {
      const rol = await this.invitaciones.aplicarCanje(
        usuarioId,
        resultado.equipoId,
        resultado.rol,
      );
      return mensajeDeCanje({ ...resultado, rol });
    }

    return mensajeDeCanje(resultado);
  }
}
