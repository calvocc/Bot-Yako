import { calcularMinuto, describirMinuto, type TiempoJugado } from './minuto';

const t = (numero: number, inicio: string, fin?: string): TiempoJugado => ({
  numero,
  iniciadoEn: new Date(inicio),
  finalizadoEn: fin ? new Date(fin) : null,
});

const formato = { minutosPorTiempo: 25 };

describe('calcularMinuto', () => {
  it('cuenta lo transcurrido del tiempo en curso', () => {
    const minuto = calcularMinuto(
      [t(1, '2026-09-06T15:00:00Z')],
      formato,
      new Date('2026-09-06T15:12:30Z'),
    );

    expect(minuto).toEqual({ minuto: 12, adicion: 0, baseMostrada: 12 });
  });

  it('usa la duración real del tiempo anterior, no la configurada', () => {
    // El primer tiempo duró 31 minutos (25 + 6 de adición). Calculando con el
    // formato, un gol al minuto 5 del segundo tiempo se guardaría como 30;
    // en realidad van 36.
    const minuto = calcularMinuto(
      [t(1, '2026-09-06T15:00:00Z', '2026-09-06T15:31:00Z'), t(2, '2026-09-06T15:45:00Z')],
      formato,
      new Date('2026-09-06T15:50:00Z'),
    );

    expect(minuto.minuto).toBe(36);
  });

  it('reporta la adición cuando el tiempo se pasa de lo configurado', () => {
    const minuto = calcularMinuto(
      [t(1, '2026-09-06T15:00:00Z')],
      formato,
      new Date('2026-09-06T15:28:00Z'),
    );

    expect(minuto).toEqual({ minuto: 28, adicion: 3, baseMostrada: 25 });
    expect(describirMinuto(minuto)).toBe('25+3');
  });

  it('no cuenta el hueco entre tiempos si uno quedó sin cerrar', () => {
    // El bot se cayó entre el fin del primer tiempo y el inicio del segundo.
    // Contar ese hueco inflaría el minuto de todo lo que sigue.
    const minuto = calcularMinuto(
      [t(1, '2026-09-06T15:00:00Z'), t(2, '2026-09-06T15:40:00Z')],
      formato,
      new Date('2026-09-06T15:50:00Z'),
    );

    expect(minuto.minuto).toBe(50);
  });

  it('con todos los tiempos cerrados devuelve la duración total', () => {
    const minuto = calcularMinuto(
      [
        t(1, '2026-09-06T15:00:00Z', '2026-09-06T15:26:00Z'),
        t(2, '2026-09-06T15:40:00Z', '2026-09-06T16:07:00Z'),
      ],
      formato,
      new Date('2026-09-06T18:00:00Z'),
    );

    expect(minuto).toEqual({ minuto: 53, adicion: 0, baseMostrada: 50 });
  });

  it('sin tiempos jugados el minuto es cero', () => {
    expect(calcularMinuto([], formato, new Date())).toEqual({
      minuto: 0,
      adicion: 0,
      baseMostrada: 0,
    });
  });
});

describe('describirMinuto', () => {
  it('muestra el minuto corrido cuando no hay adición', () => {
    expect(describirMinuto({ minuto: 23, adicion: 0, baseMostrada: 23 })).toBe('23');
  });

  it('no arrastra el exceso de un tiempo anterior al minuto que se muestra', () => {
    // 2×25: el primer tiempo se jugó 31' (cerrado) y el segundo lleva 27'.
    // El minuto guardado sería 58 (31+27), pero al estilo futbolístico cada
    // tiempo resetea a lo configurado: se muestra 50+2, no 55+2 ni 58.
    const minuto = calcularMinuto(
      [t(1, '2026-09-06T15:00:00Z', '2026-09-06T15:31:00Z'), t(2, '2026-09-06T15:45:00Z')],
      formato,
      new Date('2026-09-06T16:12:00Z'),
    );

    expect(describirMinuto(minuto)).toBe('50+2');
  });
});
