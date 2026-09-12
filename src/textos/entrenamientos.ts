import { describirFecha } from '../partidos/fechas';

/** Textos de `/nuevoentrenamiento`, `/asistencia` y `/asistencias`. */
export const textos = {
  nuevoEntrenamiento: {
    preguntaEquipo: '¿De qué equipo es el entrenamiento?',

    preguntaFecha: () =>
      '🏃 ¿Qué día es el entrenamiento? Toca una opción o escribe la fecha (12-10).',
    botonHoy: 'Hoy',
    botonAyer: 'Ayer',
    botonManana: 'Mañana',
    fechaNoEntendida: () => 'No entendí la fecha. Escríbela así: 12-10 (o "hoy").',

    preguntaRecurrente: () => '¿Se repite todas las semanas?',
    botonSoloEstaVez: 'Solo esta vez',
    botonSeRepite: 'Sí, se repite',

    preguntaDias: () => '¿Qué días entrenan? Toca uno o varios y después "Listo".',

    creadoPuntual: (equipoNombre: string, fecha: string) =>
      [
        `Entrenamiento creado ✅ ${equipoNombre} — ${describirFecha(fecha)}`,
        '',
        'Cuando llegue el día, usa /asistencia.',
      ].join('\n'),

    creadoRecurrente: (equipoNombre: string, diasTexto: string, fecha: string) =>
      [
        `Entrenamiento recurrente creado ✅ ${equipoNombre} — ${diasTexto}`,
        `Ya quedó lista la sesión de ${describirFecha(fecha)}.`,
        '',
        'Cuando llegue el día, usa /asistencia.',
      ].join('\n'),

    /**
     * Hoy no cae en ninguno de los días marcados (ej. hoy es viernes y
     * eligieron Martes/Jueves): la regla queda creada igual, y la primera
     * sesión se materializa sola cuando llegue ese día -- se lo decimos
     * explícito para que no vuelva a intentar /asistencia antes de tiempo.
     */
    creadaSinPrimeraSesion: (equipoNombre: string, diasTexto: string, proximaFecha: string) =>
      [
        `Entrenamiento recurrente creado ✅ ${equipoNombre} — ${diasTexto}`,
        `Todavía no hay sesión de hoy. La próxima se crea sola ${describirFecha(proximaFecha)}; ese día ya podés usar /asistencia.`,
      ].join('\n'),
  },

  asistencia: {
    preguntaEquipo: '¿De qué equipo tomas asistencia?',
    sinPendientes: () =>
      'No hay ningún entrenamiento sin asistencia. Crea uno con /nuevoentrenamiento.',
    /**
     * A diferencia de `sinPendientes`, acá ya existe una recurrencia activa
     * -- decirle que cree una con `/nuevoentrenamiento` sería mal consejo
     * (duplicaría la regla en vez de arreglar algo).
     */
    sinPendientesConRecurrencia: (proximaFecha: string) =>
      `Todavía no hay ninguna sesión de hoy para tomar asistencia. Ya tenés una recurrencia activa -- la próxima se crea sola ${describirFecha(proximaFecha)}; ese día ya podés usar /asistencia. No hace falta crear otra con /nuevoentrenamiento.`,
    preguntaCual: () => '¿De cuál entrenamiento tomas asistencia?',
    tocaUno: () => 'Toca uno de los entrenamientos:',

    preguntaPresentes: () =>
      'Marca a quiénes están presentes. Toca a cada jugador, "Todos" si vino el plantel completo, o escribe los dorsales separados por coma (10, 7, 4). "Listo" cuando termines.',
    sinJugadores: () =>
      'Este equipo no tiene jugadores cargados. Agrégalos con /plantilla primero.',
    avisoTextoNoReconocido:
      'No reconocí a nadie ahí. Escribe los dorsales separados por coma (10, 7, 4) o toca los botones.',

    guardada: (presentes: number, total: number) =>
      `Asistencia guardada ✅ ${presentes}/${total} presentes.`,
  },

  asistencias: {
    resumenEquipo: (equipoNombre: string, totalEntrenamientos: number, promedio: number | null) =>
      promedio === null
        ? `📋 ${equipoNombre}: sin entrenamientos registrados todavía.`
        : `📋 ${equipoNombre}: ${totalEntrenamientos} entrenamientos · ${promedio}% de asistencia promedio.`,

    sinNadie: (nombre: string) => `🔍 No encontré a nadie llamado "${nombre}".`,

    lineaJugador: (
      equipoNombre: string,
      jugador: { nombre: string; dorsal: number | null },
      fechas: readonly { fecha: string; presente: boolean }[],
    ): string => {
      const dorsal = jugador.dorsal !== null ? ` #${jugador.dorsal}` : '';
      const presentes = fechas.filter((f) => f.presente).length;
      const detalle = fechas
        .map((f) => `${f.presente ? '✅' : '❌'} ${describirFecha(f.fecha)}`)
        .join('\n');

      return [
        `📋 ${jugador.nombre}${dorsal} — ${equipoNombre}`,
        `Asistencia: ${presentes}/${fechas.length}`,
        detalle,
      ]
        .filter(Boolean)
        .join('\n');
    },

    sinEntrenamientoEseDia: (fecha: string) =>
      `Ningún equipo tuyo tuvo entrenamiento el ${describirFecha(fecha)}.`,

    /** Planilla completa de un equipo en una fecha: toda la plantilla, no solo los presentes. */
    planillaDelDia: (
      equipoNombre: string,
      fecha: string,
      jugadores: readonly { nombre: string; dorsal: number | null; presente: boolean }[],
    ): string => {
      const presentes = jugadores.filter((j) => j.presente).length;
      const lineas = jugadores.map(
        (j) => `${j.presente ? '✅' : '❌'} ${j.dorsal !== null ? `#${j.dorsal} ` : ''}${j.nombre}`,
      );

      return [
        `📋 ${equipoNombre} — ${describirFecha(fecha)} (${presentes}/${jugadores.length})`,
        ...lineas,
      ].join('\n');
    },
  },
};
