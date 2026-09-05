import type { RespuestaBot } from '../channels/channel.types';
import { botonComando } from '../conversacion/comandos';
import { ETIQUETA_ROL_CORTA, type Rol } from '../identidad/roles';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/invitaciones';
import type { ResultadoCanje } from './invitaciones.service';

type CanjeConRol = Extract<ResultadoCanje, { estado: 'ok' }> & { rol: Rol };

/**
 * Copy de cada desenlace del canje, en un solo lugar.
 *
 * `/start` y `/unirme` canjean igual pero terminan distinto, así que compartir
 * los mensajes evita que se desincronicen.
 */
export function mensajeDeCanje(resultado: ResultadoCanje | CanjeConRol): RespuestaBot {
  switch (resultado.estado) {
    case 'ok':
      return {
        texto: textos.canje.ok(ETIQUETA_ROL_CORTA[resultado.rol], resultado.equipoNombre),
        botones: [botonComando('ayuda', textosComunes.botonAyuda())],
      };

    case 'ya_eras_miembro':
      return {
        texto: textos.canje.yaEraMiembro(ETIQUETA_ROL_CORTA[resultado.rol], resultado.equipoNombre),
        botones: [botonComando('equipos', textos.canje.botonYaEraMiembro())],
      };

    case 'ok_jugador':
      return {
        texto: textos.canje.okJugador(resultado.jugadorNombre, resultado.equipoNombre),
        botones: [textos.canje.botonOkJugador()],
      };

    case 'ya_vinculado_jugador':
      return {
        texto: textos.canje.yaVinculadoJugador(resultado.jugadorNombre, resultado.equipoNombre),
        botones: [textos.canje.botonYaVinculadoJugador()],
      };

    case 'no_existe':
      return { texto: textos.canje.noExiste() };

    case 'expirada':
      return { texto: textos.canje.expirada() };

    case 'agotada':
      return { texto: textos.canje.agotada() };

    case 'revocada':
      return { texto: textos.canje.revocada() };
  }
}
