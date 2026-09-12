import { hoyLocal } from '../partidos/fechas';
import { textos } from './entrenamientos';

describe('nuevoEntrenamiento.creadoPuntual', () => {
  it('incluye el equipo y la fecha', () => {
    const texto = textos.nuevoEntrenamiento.creadoPuntual('Sub-11', hoyLocal());

    expect(texto).toContain('Entrenamiento creado ✅ Sub-11');
    expect(texto).toContain('hoy');
    expect(texto).toContain('/asistencia');
  });
});

describe('nuevoEntrenamiento.creadoRecurrente', () => {
  it('incluye el equipo, los días y la primera sesión', () => {
    const texto = textos.nuevoEntrenamiento.creadoRecurrente(
      'Sub-11',
      'Martes, Jueves',
      hoyLocal(),
    );

    expect(texto).toContain('Sub-11');
    expect(texto).toContain('Martes, Jueves');
    expect(texto).toContain('hoy');
  });
});

describe('asistencia.guardada', () => {
  it('muestra presentes sobre el total', () => {
    expect(textos.asistencia.guardada(3, 5)).toBe('Asistencia guardada ✅ 3/5 presentes.');
  });
});

describe('asistencias.resumenEquipo', () => {
  it('sin entrenamientos todavía', () => {
    expect(textos.asistencias.resumenEquipo('Sub-11', 0, null)).toContain('sin entrenamientos');
  });

  it('con entrenamientos, incluye el % de asistencia', () => {
    const texto = textos.asistencias.resumenEquipo('Sub-11', 4, 75);

    expect(texto).toContain('4 entrenamientos');
    expect(texto).toContain('75%');
  });
});

describe('asistencias.lineaJugador', () => {
  it('marca cada fecha como presente o ausente, y totaliza', () => {
    const texto = textos.asistencias.lineaJugador('Sub-11', { nombre: 'Jacob', dorsal: 10 }, [
      { fecha: hoyLocal(), presente: true },
      { fecha: '2020-01-01', presente: false },
    ]);

    expect(texto).toContain('Jacob #10 — Sub-11');
    expect(texto).toContain('Asistencia: 1/2');
    expect(texto).toContain('✅');
    expect(texto).toContain('❌');
  });
});

describe('asistencias.planillaDelDia', () => {
  it('lista toda la plantilla marcada presente/ausente', () => {
    const texto = textos.asistencias.planillaDelDia('Sub-11', hoyLocal(), [
      { nombre: 'Jacob', dorsal: 10, presente: true },
      { nombre: 'Andrés', dorsal: null, presente: false },
    ]);

    expect(texto).toContain('Sub-11 — hoy (1/2)');
    expect(texto).toContain('✅ #10 Jacob');
    expect(texto).toContain('❌ Andrés');
  });
});

describe('asistencias.sinEntrenamientoEseDia', () => {
  it('describe la fecha en vez de mostrarla en ISO', () => {
    expect(textos.asistencias.sinEntrenamientoEseDia(hoyLocal())).toContain('hoy');
  });
});
