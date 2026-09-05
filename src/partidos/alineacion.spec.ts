import { calcularMinutosJugados, derivarEnCancha, type CambioJugado } from './alineacion';

const cambio = (parcial: Partial<CambioJugado> & Pick<CambioJugado, 'sale' | 'entra'>) => ({
  minuto: null,
  ...parcial,
});

describe('derivarEnCancha', () => {
  it('sin cambios, la cancha es la titular', () => {
    expect(derivarEnCancha(['jacob', 'andres'], [])).toEqual(new Set(['jacob', 'andres']));
  });

  it('un cambio saca a uno y mete al otro', () => {
    const enCancha = derivarEnCancha(
      ['jacob', 'andres'],
      [cambio({ sale: 'jacob', entra: 'samuel' })],
    );

    expect(enCancha).toEqual(new Set(['andres', 'samuel']));
  });

  it('encadena varios cambios en orden', () => {
    // Jacob sale, entra Samuel; más tarde Samuel sale, entra Camilo.
    const enCancha = derivarEnCancha(
      ['jacob', 'andres'],
      [cambio({ sale: 'jacob', entra: 'samuel' }), cambio({ sale: 'samuel', entra: 'camilo' })],
    );

    expect(enCancha).toEqual(new Set(['andres', 'camilo']));
  });

  it('sin titular no hay nadie en cancha, aunque haya cambios', () => {
    // No debería pasar en la práctica (el gate exige titular antes de poder
    // cargar cambios), pero la función no asume nada sobre eso.
    expect(derivarEnCancha([], [cambio({ sale: 'jacob', entra: 'samuel' })])).toEqual(
      new Set(['samuel']),
    );
  });
});

describe('calcularMinutosJugados', () => {
  it('sin cambios, cada titular jugó el partido entero', () => {
    const minutos = calcularMinutosJugados(50, ['jacob', 'andres'], []);

    expect(minutos).toEqual(
      new Map([
        ['jacob', 50],
        ['andres', 50],
      ]),
    );
  });

  it('un cambio parte el minutaje entre quien sale y quien entra', () => {
    const minutos = calcularMinutosJugados(
      50,
      ['jacob', 'andres'],
      [cambio({ sale: 'jacob', entra: 'samuel', minuto: 30 })],
    );

    expect(minutos.get('jacob')).toBe(30);
    expect(minutos.get('samuel')).toBe(20);
    expect(minutos.get('andres')).toBe(50);
  });

  it('una reentrada suma los dos tramos por separado', () => {
    // Jacob sale al 20, entra Samuel; Samuel sale al 35, vuelve a entrar Jacob.
    const minutos = calcularMinutosJugados(
      50,
      ['jacob', 'andres'],
      [
        cambio({ sale: 'jacob', entra: 'samuel', minuto: 20 }),
        cambio({ sale: 'samuel', entra: 'jacob', minuto: 35 }),
      ],
    );

    // Jacob: 0-20 y 35-50 = 20 + 15 = 35.
    expect(minutos.get('jacob')).toBe(35);
    // Samuel: 20-35 = 15.
    expect(minutos.get('samuel')).toBe(15);
  });

  it('un cambio sin minuto (post partido) se trata como ocurrido al final', () => {
    const minutos = calcularMinutosJugados(
      50,
      ['jacob'],
      [cambio({ sale: 'jacob', entra: 'samuel', minuto: null })],
    );

    expect(minutos.get('jacob')).toBe(50);
    expect(minutos.get('samuel')).toBe(0);
  });

  it('a alguien que entra sin haber sido titular se le cuentan sus minutos', () => {
    const minutos = calcularMinutosJugados(
      50,
      ['jacob'],
      [cambio({ sale: 'jacob', entra: 'samuel', minuto: 40 })],
    );

    expect(minutos.get('samuel')).toBe(10);
  });
});
