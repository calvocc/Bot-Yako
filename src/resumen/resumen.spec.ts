import type { EventoCargado } from '../eventos/eventos.service';
import type { Bono, JugadorParticipante } from '../eventos/puntaje';
import type { Partido } from '../partidos/partido.mapper';
import { componerResumen } from './resumen.service';

const partido = (parcial: Partial<Partido> = {}): Partido => ({
  id: 'p1',
  equipoId: 'e1',
  rival: 'Deportivo Norte',
  fecha: '2026-09-06',
  competenciaId: 'c1',
  competenciaNombre: 'Liga del Atlántico',
  cantidadTiempos: 2,
  minutosPorTiempo: 25,
  modoCarga: 'en_vivo',
  estado: 'cerrado',
  tiempoActual: 2,
  tiempoEstado: 'finalizado',
  tiempoIniciadoEn: null,
  marcadorPropio: 2,
  marcadorRival: 1,
  marcadorPropioConfirmado: null,
  marcadorRivalConfirmado: null,
  iniciadoPor: 'u1',
  creadoPor: 'u1',
  cerradoEn: new Date(),
  cerradoPor: 'u1',
  ...parcial,
});

const gol = (nombre: string, minuto: number): EventoCargado => ({
  id: `ev-${nombre}-${minuto}`,
  tipo: 'gol',
  equipoOrigen: 'propio',
  jugadorId: nombre,
  jugadorNombre: nombre,
  jugadorDorsal: 10,
  jugadorPosicion: null,
  jugadorEntraId: null,
  jugadorEntraNombre: null,
  jugadorEntraDorsal: null,
  tiempo: 1,
  minutoCalculado: minuto,
  reportadoPor: 'u1',
  reportanteNombre: 'Carlos',
  creadoEn: new Date(),
});

describe('componerResumen', () => {
  it('arma el resumen compartible', () => {
    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya Sub-11',
      eventos: [
        gol('Jacob', 23),
        gol('Jacob', 41),
        {
          ...gol('Andrés', 35),
          tipo: 'tarjeta_amarilla',
        },
      ],
    });

    expect(texto).toContain('🏆 Ringo Amaya Sub-11  2 - 1  Deportivo Norte');
    expect(texto).toContain('Liga del Atlántico');
    expect(texto).toContain("⚽ Gol: Jacob '23, Jacob '41");
    expect(texto).toContain("🟨 Amarilla: Andrés '35");
  });

  it('muestra el marcador confirmado, no el derivado (C5)', () => {
    // Quien cerró declaró 3-1 aunque solo se hubieran cargado dos goles: el
    // resumen tiene que decir lo que pasó en la cancha.
    const texto = componerResumen({
      partido: partido({ marcadorPropioConfirmado: 3, marcadorRivalConfirmado: 1 }),
      equipoNombre: 'Ringo Amaya',
      eventos: [gol('Jacob', 23)],
    });

    expect(texto).toContain('3 - 1');
  });

  it('no cuenta los eventos del rival entre los propios', () => {
    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      eventos: [
        { ...gol('nadie', 12), equipoOrigen: 'rival', jugadorNombre: null, jugadorId: null },
      ],
    });

    expect(texto).toContain('Sin eventos cargados.');
  });

  it('avisa cuando el partido sigue abierto', () => {
    const texto = componerResumen({
      partido: partido({ estado: 'en_progreso' }),
      equipoNombre: 'Ringo Amaya',
      eventos: [gol('Jacob', 23)],
    });

    expect(texto).toContain('todavía está abierto');
  });

  it('incluye el MVP del partido (M4)', () => {
    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      eventos: [gol('Jacob', 23), gol('Jacob', 41)],
    });

    // 2 goles sin posición (3 c/u) = 6 puntos brutos; nota = 6 + (6/8)×4 = 9.0.
    expect(texto).toContain('MVP del partido: Jacob (9.0) — 2 goles');
  });

  it('no muestra MVP si solo hubo tarjetas (sin evento positivo)', () => {
    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      eventos: [{ ...gol('Andrés', 35), tipo: 'tarjeta_amarilla' }],
    });

    expect(texto).not.toContain('MVP del partido');
  });

  it('cuenta un cambio con quien sale y quien entra (no solo quien sale)', () => {
    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      eventos: [
        {
          ...gol('Jacob', 34),
          tipo: 'cambio',
          jugadorEntraId: 'j-andres',
          jugadorEntraNombre: 'Andrés',
          jugadorEntraDorsal: 7,
        },
      ],
    });

    expect(texto).toContain("🔄 Cambio: Jacob → Andrés '34");
    // Sin dorsal: es el mismo estilo que el resto del resumen (a diferencia
    // de la bitácora en vivo, que sí lo muestra).
    expect(texto).not.toContain('#7');
  });

  it('no muestra MVP sin eventos cargados', () => {
    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      eventos: [],
    });

    expect(texto).not.toContain('MVP del partido');
  });

  it('lista la nota de todos los que jugaron, de mayor a menor', () => {
    const participantes: JugadorParticipante[] = [
      { jugadorId: 'Jacob', nombre: 'Jacob', dorsal: 10, posicion: null },
      { jugadorId: 'Andrés', nombre: 'Andrés', dorsal: 7, posicion: null },
    ];

    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      eventos: [gol('Jacob', 23)],
      participantes,
    });

    const posNotas = texto.indexOf('📊 Notas:');

    expect(posNotas).toBeGreaterThan(-1);
    // Jacob (con un gol) queda antes que Andrés (sin eventos, nota base).
    expect(texto.indexOf('Jacob #10', posNotas)).toBeLessThan(texto.indexOf('Andrés #7', posNotas));
  });

  it('muestra con nota base (6.0) a quien jugó sin tener ningún evento', () => {
    const participantes: JugadorParticipante[] = [
      { jugadorId: 'Andrés', nombre: 'Andrés', dorsal: 7, posicion: null },
    ];

    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      eventos: [],
      participantes,
    });

    expect(texto).toContain('Andrés #7: 6.0');
    // Sí hay a quién listar, aunque nadie tuvo eventos: no es "sin eventos".
    expect(texto).not.toContain('Sin eventos cargados.');
  });

  it('suma el bono de cierre a la nota del jugador', () => {
    const participantes: JugadorParticipante[] = [
      { jugadorId: 'Andrés', nombre: 'Andrés', dorsal: 7, posicion: 'defensa' },
    ];
    const bonos: Bono[] = [{ jugadorId: 'Andrés', puntos: 3 }];

    const texto = componerResumen({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      eventos: [],
      participantes,
      bonos,
    });

    // nota = 6 + (3/8)×4 = 7.5.
    expect(texto).toContain('Andrés #7: 7.5');
  });
});
