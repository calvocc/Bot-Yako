import type { EventoCargado } from './eventos.service';
import { calcularMvp, describirMvp } from './puntaje';

let contador = 0;

const evento = (parcial: Partial<EventoCargado>): EventoCargado => ({
  id: `ev-${++contador}`,
  tipo: 'gol',
  equipoOrigen: 'propio',
  jugadorId: 'j1',
  jugadorNombre: 'Jacob',
  jugadorDorsal: 10,
  tiempo: 1,
  minutoCalculado: 10,
  reportadoPor: 'u1',
  reportanteNombre: 'Carlos',
  creadoEn: new Date(),
  ...parcial,
});

describe('calcularMvp', () => {
  it('elige al de más puntos', () => {
    const destacado = calcularMvp([
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'gol' }),
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'gol' }),
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'asistencia' }),
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'gol' }),
    ]);

    expect(destacado).toMatchObject({ nombre: 'Jacob', puntos: 8, goles: 2, asistencias: 1 });
  });

  it('no elige a nadie sin eventos', () => {
    expect(calcularMvp([])).toBeNull();
  });

  it('no elige a nadie si solo hubo eventos negativos', () => {
    const destacado = calcularMvp([
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'tarjeta_amarilla' }),
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'tarjeta_roja' }),
    ]);

    expect(destacado).toBeNull();
  });

  it('no elige a nadie con puntaje neto negativo, aunque haya tenido un evento positivo', () => {
    // Una asistencia (+2) seguida de una roja (-3) da -1 neto: no alcanza,
    // aunque alguna vez haya tenido "un evento positivo".
    const destacado = calcularMvp([
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'asistencia' }),
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'tarjeta_roja' }),
    ]);

    expect(destacado).toBeNull();
  });

  it('no cuenta eventos del rival ni sin jugador identificado', () => {
    const destacado = calcularMvp([
      evento({ equipoOrigen: 'rival', jugadorId: null, jugadorNombre: null }),
      evento({ jugadorId: null, jugadorNombre: null }),
    ]);

    expect(destacado).toBeNull();
  });

  it('desempata por goles cuando los puntos quedan iguales', () => {
    const destacado = calcularMvp([
      // Jacob: 1 gol + 1 asistencia = 5 pts.
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'gol' }),
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'asistencia' }),
      // Andrés: 1 gol + 1 gol - 1 amarilla = 5 pts, pero más goles.
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'gol' }),
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'gol' }),
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'tarjeta_amarilla' }),
    ]);

    expect(destacado).toMatchObject({ nombre: 'Andrés', puntos: 5, goles: 2 });
  });

  it('desempata por menor dorsal cuando todo lo demás empata', () => {
    const destacado = calcularMvp([
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', jugadorDorsal: 10, tipo: 'gol' }),
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', jugadorDorsal: 7, tipo: 'gol' }),
    ]);

    expect(destacado).toMatchObject({ nombre: 'Andrés', dorsal: 7 });
  });
});

describe('describirMvp', () => {
  it('lista solo las categorías con conteo', () => {
    const destacado = calcularMvp([
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'gol' }),
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'gol' }),
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'asistencia' }),
    ]);

    expect(destacado && describirMvp(destacado)).toBe('Jacob (8 pts — 2 goles, 1 asistencia)');
  });

  it('sin desglose si el único aporte es el punto', () => {
    const destacado = calcularMvp([
      evento({ jugadorId: 'jacob', jugadorNombre: 'Jacob', tipo: 'asistencia' }),
    ]);

    expect(destacado && describirMvp(destacado)).toBe('Jacob (2 pts — 1 asistencia)');
  });
});
