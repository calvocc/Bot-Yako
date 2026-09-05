/** Textos del resumen compartible del partido. */
export const textos = {
  sinEventos: () => 'Sin eventos cargados.',
  mvp: (descripcion: string) => `MVP del partido: ${descripcion}`,
  notas: {
    encabezado: () => '📊 Notas:',
    /** "Jacob #10: 7.5" -- mismo formato de nombre que `describirJugador`. */
    linea: (nombre: string, dorsal: number | null, nota: number) =>
      `${dorsal !== null ? `${nombre} #${dorsal}` : nombre}: ${nota.toFixed(1)}`,
  },
  partidoAbierto: () => '⏳ El partido todavía está abierto.',
};
