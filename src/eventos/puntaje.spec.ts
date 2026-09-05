import type { EventoCargado } from './eventos.service';
import {
  calcularMvp,
  calcularNotas,
  describirMvp,
  notaDesde,
  TECHO,
  type Bono,
  type JugadorParticipante,
} from './puntaje';

let contador = 0;

const evento = (parcial: Partial<EventoCargado>): EventoCargado => ({
  id: `ev-${++contador}`,
  tipo: 'gol',
  equipoOrigen: 'propio',
  jugadorId: 'j1',
  jugadorNombre: 'Jacob',
  jugadorDorsal: 10,
  jugadorPosicion: null,
  jugadorEntraId: null,
  jugadorEntraNombre: null,
  jugadorEntraDorsal: null,
  tiempo: 1,
  minutoCalculado: 10,
  reportadoPor: 'u1',
  reportanteNombre: 'Carlos',
  creadoEn: new Date(),
  ...parcial,
});

const participante = (parcial: Partial<JugadorParticipante>): JugadorParticipante => ({
  jugadorId: 'jacob',
  nombre: 'Jacob',
  dorsal: 10,
  posicion: null,
  ...parcial,
});

describe('notaDesde', () => {
  it('da la base (6) sin puntos brutos', () => {
    expect(notaDesde(0)).toBe(6);
  });

  it('llega a 10 con el techo exacto', () => {
    expect(notaDesde(TECHO)).toBe(10);
  });

  it('no pasa de 10 aunque se pasen del techo', () => {
    expect(notaDesde(TECHO * 5)).toBe(10);
  });

  it('no baja de 0 con puntos brutos muy negativos', () => {
    expect(notaDesde(-TECHO * 5)).toBe(0);
  });
});

describe('calcularNotas', () => {
  it('siembra a los participantes con la nota base aunque no tengan eventos', () => {
    const notas = calcularNotas([], [participante({ jugadorId: 'andres', nombre: 'Andrés' })]);

    expect(notas).toEqual([
      expect.objectContaining({ jugadorId: 'andres', nombre: 'Andrés', nota: 6, puntosBrutos: 0 }),
    ]);
  });

  it('el gol de un arquero o defensa vale más que el de un delantero', () => {
    const notas = calcularNotas([
      evento({ jugadorId: 'jacob', jugadorPosicion: 'defensa', tipo: 'gol' }),
      evento({
        jugadorId: 'andres',
        jugadorNombre: 'Andrés',
        jugadorPosicion: 'delantero',
        tipo: 'gol',
      }),
    ]);

    const jacob = notas.find((n) => n.jugadorId === 'jacob');
    const andres = notas.find((n) => n.jugadorId === 'andres');

    expect(jacob?.puntosBrutos).toBe(5);
    expect(andres?.puntosBrutos).toBe(3);
  });

  it('un gol sin posición cargada vale igual que el de un delantero', () => {
    const notas = calcularNotas([
      evento({ jugadorId: 'jacob', jugadorPosicion: null, tipo: 'gol' }),
    ]);

    expect(notas[0].puntosBrutos).toBe(3);
  });

  it('acumula los eventos nuevos', () => {
    const notas = calcularNotas([
      evento({ jugadorId: 'jacob', tipo: 'recuperacion' }),
      evento({ jugadorId: 'jacob', tipo: 'rechazo' }),
      evento({ jugadorId: 'jacob', tipo: 'regate' }),
      evento({ jugadorId: 'jacob', tipo: 'tiro_al_arco' }),
      evento({ jugadorId: 'jacob', tipo: 'falta_recibida' }),
      evento({ jugadorId: 'jacob', tipo: 'atajada' }),
      evento({ jugadorId: 'jacob', tipo: 'penal_atajado' }),
    ]);

    expect(notas[0]).toMatchObject({
      recuperaciones: 1,
      rechazos: 1,
      regates: 1,
      tirosAlArco: 1,
      faltasRecibidas: 1,
      atajadas: 1,
      penalesAtajados: 1,
      puntosBrutos: 0.5 + 0.5 + 0.5 + 0.5 + 0.3 + 1 + 4,
    });
  });

  it('suma los bonos de cierre por jugador', () => {
    const bonos: Bono[] = [{ jugadorId: 'jacob', puntos: 3 }];
    const notas = calcularNotas([], [participante({})], bonos);

    expect(notas[0].puntosBrutos).toBe(3);
  });

  it('descarta un bono de alguien que no es participante ni tuvo eventos', () => {
    const bonos: Bono[] = [{ jugadorId: 'fantasma', puntos: 3 }];
    const notas = calcularNotas([], [participante({})], bonos);

    expect(notas).toHaveLength(1);
    expect(notas[0].jugadorId).toBe('jacob');
  });

  it('no cuenta eventos del rival ni sin jugador identificado', () => {
    const notas = calcularNotas([
      evento({ equipoOrigen: 'rival', jugadorId: null, jugadorNombre: null }),
      evento({ jugadorId: null, jugadorNombre: null }),
    ]);

    expect(notas).toHaveLength(0);
  });

  it('ordena de mayor a menor nota', () => {
    const notas = calcularNotas([
      evento({ jugadorId: 'jacob', tipo: 'gol' }),
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'tarjeta_roja' }),
    ]);

    expect(notas.map((n) => n.jugadorId)).toEqual(['jacob', 'andres']);
  });

  it('desempata por puntos brutos, luego goles, luego asistencias, luego menor dorsal', () => {
    const notas = calcularNotas([
      // Jacob: 1 gol + 1 asistencia.
      evento({ jugadorId: 'jacob', jugadorDorsal: 10, tipo: 'gol' }),
      evento({ jugadorId: 'jacob', jugadorDorsal: 10, tipo: 'asistencia' }),
      // Andrés: 2 goles - 1 amarilla, mismos puntos brutos que Jacob pero más goles.
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', jugadorDorsal: 7, tipo: 'gol' }),
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', jugadorDorsal: 7, tipo: 'gol' }),
      evento({
        jugadorId: 'andres',
        jugadorNombre: 'Andrés',
        jugadorDorsal: 7,
        tipo: 'tarjeta_amarilla',
      }),
    ]);

    expect(notas[0].jugadorId).toBe('andres');
  });
});

describe('calcularMvp', () => {
  it('es quien queda primero en calcularNotas', () => {
    const eventos = [
      evento({ jugadorId: 'jacob', tipo: 'gol' }),
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'tarjeta_amarilla' }),
    ];

    expect(calcularMvp(eventos)).toEqual(calcularNotas(eventos)[0]);
  });

  it('null sin eventos ni participantes', () => {
    expect(calcularMvp([])).toBeNull();
  });

  it('null si todos terminaron con puntaje neto negativo (solo tarjetas)', () => {
    // Con la base de 6, esto igual sería una nota "aprobada" -- pero no hubo
    // nada que destacar. Regression: sin este filtro, calcularMvp devolvía
    // a Andrés igual, apoyado solo en que su nota quedó primera.
    const eventos = [
      evento({ jugadorId: 'andres', jugadorNombre: 'Andrés', tipo: 'tarjeta_amarilla' }),
    ];

    expect(calcularMvp(eventos)).toBeNull();
  });
});

describe('describirMvp', () => {
  it('lista solo las categorías con conteo, con la nota redondeada a un decimal', () => {
    const destacado = calcularMvp([
      evento({ jugadorId: 'jacob', tipo: 'gol' }),
      evento({ jugadorId: 'jacob', tipo: 'gol' }),
      evento({ jugadorId: 'jacob', tipo: 'asistencia' }),
    ]);

    // 2 goles sin posición (3 c/u) + 1 asistencia (2) = 8 puntos brutos = techo exacto → nota 10.
    expect(destacado && describirMvp(destacado)).toBe('Jacob (10.0) — 2 goles, 1 asistencia');
  });

  it('sin desglose si el único aporte no cuenta en ningún conteo', () => {
    // El bono de cierre suma puntos sin corresponder a ninguna categoría
    // mostrable (a diferencia de un gol o una atajada): es el único caso
    // real donde un destacado no tiene nada que desglosar.
    const destacado = calcularMvp(
      [],
      [participante({ jugadorId: 'jacob', nombre: 'Jacob' })],
      [{ jugadorId: 'jacob', puntos: 3 }],
    );

    // Bono de cierre (+3) = 3 puntos brutos; nota = 6 + (3/8)×4 = 7.5.
    expect(destacado && describirMvp(destacado)).toBe('Jacob (7.5)');
  });

  it('sin MVP si el único evento no suma ni resta puntos (cambio)', () => {
    // Un neto de 0 no alcanza para destacar a nadie: no hizo nada malo, pero
    // tampoco hizo nada bueno.
    expect(calcularMvp([evento({ jugadorId: 'jacob', tipo: 'cambio' })])).toBeNull();
  });
});
