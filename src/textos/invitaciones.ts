/**
 * Cuerpo compartido de un código generado (`/invitar` e `/invitarjugador`):
 * solo cambia el encabezado — quién puede usar el código y qué gana. Antes
 * era el mismo bloque de líneas retipeado en los dos, con el riesgo de que
 * una corrección (el pie, el enlace opcional) se aplicara en uno y se
 * olvidara en el otro.
 */
function bloqueCodigo(
  encabezado: string,
  datos: { dias: number; etiquetaUsos: string; codigo: string; enlace?: string },
): string {
  const lineas = [
    encabezado,
    `Válido ${datos.dias} días · ${datos.etiquetaUsos}`,
    '',
    datos.codigo,
  ];

  if (datos.enlace) {
    lineas.push('', 'O comparte este enlace:', datos.enlace);
  }

  lineas.push('', 'Quien lo reciba entra con /unirme y el código.');

  return lineas.join('\n');
}

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
    }): string => bloqueCodigo(`🔑 Código para *${datos.equipo}* — ${datos.rol}`, datos),
  },

  unirme: {
    pedirCodigo: () => 'Pega el código del equipo al que te quieres sumar.',
  },

  mishijos: {
    sinHijos: () => 'Todavía no estás vinculado a ningún jugador. Pídele el código a su equipo.',
    listado: (lineas: string) => `👨‍👩‍👧 Tus jugadores vinculados:\n\n${lineas}`,
  },

  invitarJugador: {
    preguntaEquipo: '¿De cuál equipo es el jugador?',
    preguntaJugador: '¿Para cuál jugador es la invitación?',
    sinJugadores: () => 'Esta plantilla está vacía — primero carga jugadores con /plantilla.',
    codigoGenerado: (datos: {
      jugador: string;
      equipo: string;
      dias: number;
      etiquetaUsos: string;
      codigo: string;
      enlace?: string;
    }): string =>
      bloqueCodigo(`🔑 Código para vincularse a *${datos.jugador}* (${datos.equipo})`, datos),
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

    yaEraMiembro: (rol: string, equipoNombre: string) =>
      `Ya eras ${rol} en "${equipoNombre}", así que no cambié nada.`,
    /** El id de ruteo (`cmd:equipos`) lo arma `mensajes-canje.ts` con `botonComando`. */
    botonYaEraMiembro: () => 'Ver mis equipos',

    okJugador: (jugadorNombre: string, equipoNombre: string): string =>
      `¡Listo! Quedaste vinculado a *${jugadorNombre}* — vas a poder ver todo lo de "${equipoNombre}" ✅\n\nSi tienes otro hijo en la academia, usa /unirme con su código.`,
    // Sin botón propio: es el mismo "Ver qué puedo hacer" de comunes.botonAyuda().

    yaVinculadoJugador: (jugadorNombre: string, equipoNombre: string) =>
      `Ya estabas vinculado a "${jugadorNombre}" (${equipoNombre}), así que no cambié nada.`,
    /** El id de ruteo (`cmd:mishijos`) lo arma `mensajes-canje.ts` con `botonComando`. */
    botonYaVinculadoJugador: () => 'Ver mis hijos',

    noExiste: () => '❌ Ese código no existe. Revísalo y vuelve a intentar — se ve así: YAKO-X7F2A',
    expirada: () => '❌ Ese código ya expiró. Pídele al admin que te genere uno nuevo.',
    agotada: () =>
      '❌ Ese código ya llegó a su límite de usos. Pídele al admin que te genere otro.',
    revocada: () => '❌ Ese código fue anulado. Pídele al admin que te genere uno nuevo.',
  },
};
