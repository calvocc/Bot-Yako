import { botonComando } from '../conversacion/comandos';
import type { Boton } from '../channels/channel.types';

/** Textos de `/invitar`, `/unirme` y el mensaje compartido de resultado del canje. */
export const textos = {
  invitar: {
    preguntaEquipo: '¿Para cuál equipo es la invitación?',
    preguntaRol: '🔑 ¿Qué podrá hacer quien use este código?',
    botonSoloConsultar: '👀 Solo consultar',
    botonCargarEventos: '✏️ Cargar eventos',
    repetirRol: 'Toca una de las dos opciones:',
    preguntaUsos: '¿Para cuántas personas?',
    botonUnaPersona: '👤 Una persona',
    botonTodoElGrupo: '👥 Todo el grupo',
    codigoGenerado: (datos: {
      equipo: string;
      rol: string;
      dias: number;
      etiquetaUsos: string;
      codigo: string;
      enlace?: string;
    }): string => {
      const lineas = [
        `🔑 Código para *${datos.equipo}* — ${datos.rol}`,
        `Válido ${datos.dias} días · ${datos.etiquetaUsos}`,
        '',
        datos.codigo,
      ];

      if (datos.enlace) {
        lineas.push('', 'O comparte este enlace:', datos.enlace);
      }

      lineas.push('', 'Quien lo reciba entra con /unirme y el código.');

      return lineas.join('\n');
    },
  },

  unirme: {
    pedirCodigo: () => 'Pega el código del equipo al que te quieres sumar.',
  },

  /**
   * Un desenlace por cada `ResultadoCanje.estado`.
   *
   * `/start` y `/unirme` canjean igual pero terminan distinto, así que
   * compartir el copy evita que se desincronicen.
   */
  canje: {
    ok: (rol: string, equipoNombre: string): string =>
      `¡Listo! Quedaste como ${rol} en "${equipoNombre}" ✅\n\nSi más adelante quieres sumarte a otro equipo, usa /unirme con el código.`,
    botonOk: (): Boton => botonComando('ayuda', 'Ver qué puedo hacer'),

    yaEraMiembro: (rol: string, equipoNombre: string) =>
      `Ya eras ${rol} en "${equipoNombre}", así que no cambié nada.`,
    botonYaEraMiembro: (): Boton => botonComando('equipos', 'Ver mis equipos'),

    noExiste: () => '❌ Ese código no existe. Revísalo y vuelve a intentar — se ve así: YAKO-X7F2A',
    expirada: () => '❌ Ese código ya expiró. Pídele al admin que te genere uno nuevo.',
    agotada: () =>
      '❌ Ese código ya llegó a su límite de usos. Pídele al admin que te genere otro.',
    revocada: () => '❌ Ese código fue anulado. Pídele al admin que te genere uno nuevo.',
  },
};
