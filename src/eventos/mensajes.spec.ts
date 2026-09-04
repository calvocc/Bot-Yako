import type { Partido } from '../partidos/partido.mapper';
import type { EventoCargado } from './eventos.service';
import { lineaDeBitacora, panelEnVivo, protagonista } from './mensajes';

const partido = (parcial: Partial<Partido> = {}): Partido => ({
  id: 'p1',
  equipoId: 'e1',
  rival: 'Deportivo Norte',
  fecha: '2026-09-06',
  competenciaId: 'c1',
  competenciaNombre: 'Liga',
  cantidadTiempos: 2,
  minutosPorTiempo: 25,
  modoCarga: 'en_vivo',
  estado: 'en_progreso',
  tiempoActual: 1,
  tiempoEstado: 'en_curso',
  tiempoIniciadoEn: new Date(),
  marcadorPropio: 1,
  marcadorRival: 0,
  marcadorPropioConfirmado: null,
  marcadorRivalConfirmado: null,
  iniciadoPor: 'u1',
  creadoPor: 'u1',
  cerradoEn: null,
  cerradoPor: null,
  ...parcial,
});

const evento = (parcial: Partial<EventoCargado> = {}): EventoCargado => ({
  id: 'ev1',
  tipo: 'gol',
  equipoOrigen: 'propio',
  jugadorId: 'j1',
  jugadorNombre: 'Jacob',
  jugadorDorsal: 10,
  jugadorEntraId: null,
  jugadorEntraNombre: null,
  jugadorEntraDorsal: null,
  tiempo: 1,
  minutoCalculado: 23,
  reportadoPor: 'u1',
  reportanteNombre: 'Carlos',
  creadoEn: new Date(),
  ...parcial,
});

describe('lineaDeBitacora', () => {
  it('deja la crónica del gol con marcador', () => {
    const linea = lineaDeBitacora(evento(), { propio: 1, rival: 0 }, 'Ringo Amaya', 'Norte');

    expect(linea).toBe('⚽ Gol de Jacob #10, min 23 — 1-0');
  });

  it('atribuye al equipo lo que no tiene jugador identificado', () => {
    const linea = lineaDeBitacora(
      evento({ equipoOrigen: 'rival', jugadorId: null, jugadorNombre: null, jugadorDorsal: null }),
      { propio: 1, rival: 1 },
      'Ringo Amaya',
      'Norte',
    );

    expect(linea).toBe('⚽ Gol de Norte, min 23 — 1-1');
  });

  it('no cuelga el marcador de un evento que no lo mueve', () => {
    const linea = lineaDeBitacora(
      evento({ tipo: 'tarjeta_amarilla' }),
      { propio: 1, rival: 0 },
      'Ringo Amaya',
      'Norte',
    );

    expect(linea).toBe('🟨 Amarilla de Jacob #10, min 23');
  });
});

describe('protagonista', () => {
  it('omite el dorsal cuando el jugador no lo tiene', () => {
    const sinDorsal = {
      jugadorNombre: 'Jacob',
      jugadorDorsal: null,
      equipoOrigen: 'propio' as const,
    };

    expect(protagonista(sinDorsal, 'Ringo', 'Norte')).toBe('Jacob');
  });
});

describe('panelEnVivo', () => {
  it('muestra el reloj mientras el tiempo corre', () => {
    const panel = panelEnVivo({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 23, adicion: 0, baseMostrada: 23 },
    });

    expect(panel.texto).toContain('Tiempo 1 · min 23 · 1-0');
    expect(panel.botones.map((b) => b.id)).toContain('ev:gol');
    expect(panel.botones.map((b) => b.id)).toContain('pa:fintiempo');
  });

  it('ofrece arrancar el siguiente tiempo cuando el actual terminó', () => {
    const panel = panelEnVivo({
      partido: partido({ tiempoEstado: 'finalizado' }),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 26, adicion: 1, baseMostrada: 25 },
    });

    expect(panel.texto).toContain('Tiempo 1 finalizado');
    expect(panel.botones.find((b) => b.id === 'pa:fintiempo')?.texto).toBe('▶️ Tiempo 2');
  });

  it('no ofrece un tiempo que el formato no tiene', () => {
    const panel = panelEnVivo({
      partido: partido({ tiempoActual: 2, tiempoEstado: 'finalizado' }),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 52, adicion: 0, baseMostrada: 52 },
    });

    expect(panel.texto).toContain('era el último');
    expect(panel.botones.map((b) => b.id)).not.toContain('pa:fintiempo');
  });

  it('respeta el límite de rótulo de los botones', () => {
    const panel = panelEnVivo({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 0, adicion: 0, baseMostrada: 0 },
    });

    for (const boton of panel.botones) {
      expect(boton.texto.length).toBeLessThanOrEqual(20);
    }
  });
});
