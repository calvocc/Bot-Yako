import { botonComando } from '../conversacion/comandos';
import type { RespuestaBot } from '../channels/channel.types';
import { ETIQUETA_ROL_CORTA, type Rol } from '../identidad/roles';
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
        texto: `¡Listo! Quedaste como ${ETIQUETA_ROL_CORTA[resultado.rol]} en "${resultado.equipoNombre}" ✅\n\nSi más adelante quieres sumarte a otro equipo, usa /unirme con el código.`,
        botones: [botonComando('ayuda', 'Ver qué puedo hacer')],
      };

    case 'ya_eras_miembro':
      return {
        texto: `Ya eras ${ETIQUETA_ROL_CORTA[resultado.rol]} en "${resultado.equipoNombre}", así que no cambié nada.`,
        botones: [botonComando('equipos', 'Ver mis equipos')],
      };

    case 'no_existe':
      return {
        texto: 'Ese código no existe. Revísalo y vuelve a intentar — se ve así: YAKO-X7F2A',
      };

    case 'expirada':
      return { texto: 'Ese código ya expiró. Pídele al admin que te genere uno nuevo.' };

    case 'agotada':
      return {
        texto: 'Ese código ya llegó a su límite de usos. Pídele al admin que te genere otro.',
      };

    case 'revocada':
      return { texto: 'Ese código fue anulado. Pídele al admin que te genere uno nuevo.' };
  }
}
