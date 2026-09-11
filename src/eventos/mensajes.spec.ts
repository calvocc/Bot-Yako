import type { Partido } from '../partidos/partido.mapper';
import { EVENTOS } from './evento.tipos';
import type { EventoCargado } from './eventos.service';
import { botonesDeEvento, lineaDeBitacora, panelEnVivo, protagonista } from './mensajes';

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
  jugadorPosicion: null,
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
      paginaEventos: 0,
    });

    expect(panel.texto).toContain('Tiempo 1 · min 23 · 1-0');
    expect(panel.botones.map((b) => b.id)).toContain('ev:gol');
  });

  it('los eventos no le dejan lugar a los controles: la página 0 aprovecha las 9 opciones', () => {
    // Los controles solo entran en la última página, así que la paginación
    // de eventos no reserva nada para ellos (reservar=0): 9 eventos por
    // página, 13 eventos en 2 páginas (9+4). Antes de este ajuste quedaban
    // solo 5 por página (9-4, reservando los 4 controles en todas) aunque
    // no se mostraran ahí -- este test cubre que eso no vuelva a pasar.
    const pagina0 = panelEnVivo({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 23, adicion: 0, baseMostrada: 23 },
      paginaEventos: 0,
    });
    const idsEvento = pagina0.botones.map((b) => b.id).filter((id) => id.startsWith('ev:'));

    expect(idsEvento).toHaveLength(9);
    expect(pagina0.botones.map((b) => b.id)).toContain('pag:mas');
    expect(pagina0.botones.map((b) => b.id)).not.toContain('pa:fintiempo');
    expect(pagina0.botones.map((b) => b.id)).not.toContain('pa:deshacer');

    // La página 1 sí es la última (quedan 13-9=4 eventos): ahí entran los
    // controles -- después de los eventos que quedan -- y "Ver más" sigue
    // estando, para volver a la página 0.
    const pagina1 = panelEnVivo({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 23, adicion: 0, baseMostrada: 23 },
      paginaEventos: 1,
    });

    expect(pagina1.botones.filter((b) => b.id.startsWith('ev:'))).toHaveLength(4);
    expect(pagina1.botones.map((b) => b.id)).toEqual(
      expect.arrayContaining([
        'pag:mas',
        'pa:fintiempo',
        'pa:deshacer',
        'pa:resumen',
        'pa:finpartido',
      ]),
    );
  });

  it('ofrece arrancar el siguiente tiempo cuando el actual terminó, en la última página', () => {
    // 13 eventos en páginas de 9 (reservar=0 siempre): la última sigue
    // siendo la página 1, sin importar cuántos controles reserve
    // `botonesDeControl` -- ya no le sacan lugar a los eventos.
    const panel = panelEnVivo({
      partido: partido({ tiempoEstado: 'finalizado' }),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 26, adicion: 1, baseMostrada: 25 },
      paginaEventos: 1,
    });

    expect(panel.texto).toContain('Tiempo 1 finalizado');
    expect(panel.botones.find((b) => b.id === 'pa:fintiempo')?.texto).toBe('▶️ Tiempo 2');
  });

  it('no ofrece un tiempo que el formato no tiene', () => {
    const panel = panelEnVivo({
      partido: partido({ tiempoActual: 2, tiempoEstado: 'finalizado' }),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 52, adicion: 0, baseMostrada: 52 },
      paginaEventos: 0,
    });

    expect(panel.texto).toContain('era el último');
    expect(panel.botones.map((b) => b.id)).not.toContain('pa:fintiempo');
  });

  it('respeta el límite de rótulo de los botones', () => {
    const panel = panelEnVivo({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 0, adicion: 0, baseMostrada: 0 },
      paginaEventos: 0,
    });

    for (const boton of panel.botones) {
      expect(boton.texto.length).toBeLessThanOrEqual(20);
    }
  });

  it('nunca manda más de 10 botones en total, en ninguna página', () => {
    // Recorre las 2 páginas de ambos escenarios de controles (4 con reloj
    // corriendo, 3 sin "Fin del tiempo"): el cupo nunca se pasa, ni siquiera
    // en la última página, donde se suman eventos + "Ver más" + controles.
    for (const paginaEventos of [0, 1]) {
      const conCuatroControles = panelEnVivo({
        partido: partido(),
        equipoNombre: 'Ringo Amaya',
        minuto: { minuto: 23, adicion: 0, baseMostrada: 23 },
        paginaEventos,
      });

      expect(conCuatroControles.botones.length).toBeLessThanOrEqual(10);

      const conTresControles = panelEnVivo({
        partido: partido({ tiempoActual: 2, tiempoEstado: 'finalizado' }),
        equipoNombre: 'Ringo Amaya',
        minuto: { minuto: 52, adicion: 0, baseMostrada: 52 },
        paginaEventos,
      });

      expect(conTresControles.botones.length).toBeLessThanOrEqual(10);
    }
  });

  it('la última página también tiene "Ver más", para volver a la primera', () => {
    const panel = panelEnVivo({
      partido: partido(),
      equipoNombre: 'Ringo Amaya',
      minuto: { minuto: 23, adicion: 0, baseMostrada: 23 },
      paginaEventos: 1,
    });

    expect(panel.botones.map((b) => b.id)).toContain('pag:mas');
    expect(panel.botones.length).toBeLessThanOrEqual(10);
  });
});

describe('botonesDeEvento', () => {
  it('pagina los 13 tipos de evento en 3 páginas con 3 controles reservados', () => {
    const pagina0 = botonesDeEvento(0, 3);
    const pagina1 = botonesDeEvento(1, 3);
    const pagina2 = botonesDeEvento(2, 3);

    // 6 eventos + "Ver más" = 7, dentro del cupo reservado.
    expect(pagina0.botones).toHaveLength(7);
    expect(pagina0.botones.at(-1)?.id).toBe('pag:mas');
    expect(pagina0.hayMas).toBe(true);
    expect(pagina1.botones).toHaveLength(7);
    expect(pagina1.botones.at(-1)?.id).toBe('pag:mas');
    expect(pagina1.hayMas).toBe(true);
    // Quedan 13 - 6 - 6 = 1 evento en la última página. Esta función no le
    // agrega "Ver más" propio -- eso lo hace `panelEnVivo`, siempre -- pero
    // sí avisa con `hayMas` en falso que ya no queda nada más por paginar.
    expect(pagina2.botones).toHaveLength(1);
    expect(pagina2.botones.at(-1)?.id).not.toBe('pag:mas');
    expect(pagina2.hayMas).toBe(false);
  });

  it('nunca deja un tipo de evento sin poder tocarse', () => {
    const idsVistos = new Set<string>();

    for (let pagina = 0; pagina < 3; pagina++) {
      for (const boton of botonesDeEvento(pagina, 3).botones) {
        if (boton.id !== 'pag:mas') idsVistos.add(boton.id);
      }
    }

    expect(idsVistos.size).toBe(EVENTOS.length);
  });
});
