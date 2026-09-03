import type { EventoCargado } from '../eventos/eventos.service';
import type { Partido } from '../partidos/partido.mapper';
import { componerResumen } from './resumen.service';

const partido = (parcial: Partial<Partido> = {}): Partido => ({
  id: 'p1',
  equipoId: 'e1',
  rival: 'Deportivo Norte',
  fecha: '2026-09-06',
  competencia: 'Liga del Atlántico',
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
});
