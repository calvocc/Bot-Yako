import type { posicionJugadorEnum } from '../db/schema/enums';

export type Posicion = (typeof posicionJugadorEnum.enumValues)[number];

export const POSICIONES: readonly Posicion[] = ['arquero', 'defensa', 'mediocampista', 'delantero'];

/** "Arquero", "Defensa", ... — para botones y textos. */
export const ETIQUETA_POSICION: Record<Posicion, string> = {
  arquero: 'Arquero',
  defensa: 'Defensa',
  mediocampista: 'Mediocampista',
  delantero: 'Delantero',
};

export function esPosicion(valor: string): valor is Posicion {
  return POSICIONES.includes(valor as Posicion);
}
