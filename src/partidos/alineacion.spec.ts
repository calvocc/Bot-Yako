import {
  calcularMinutosJugados,
  derivarEnCancha,
  golesRecibidosPorArquero,
  type CambioJugado,
} from './alineacion';

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

describe('golesRecibidosPorArquero', () => {
  it('sin arquero no atribuye nada', () => {
    expect(golesRecibidosPorArquero([], ['a'], [], [5], 1).size).toBe(0);
  });

  it('con un solo arquero, todo el marcador rival es suyo', () => {
    expect(golesRecibidosPorArquero(['arq'], ['arq'], [], [null, 10], 3)).toEqual(
      new Map([['arq', 3]]),
    );
  });

  it('con dos, cada gol va a quien estaba en cancha en ese minuto', () => {
    const cambios = [{ sale: 'arq1', entra: 'arq2', minuto: 20 }];
    const recibidos = golesRecibidosPorArquero(
      ['arq1', 'arq2'],
      ['arq1', 'x'],
      cambios,
      [5, 25, 30],
      3,
    );

    expect(recibidos).toEqual(
      new Map([
        ['arq1', 1],
        ['arq2', 2],
      ]),
    );
  });

  it('lo que no se puede ubicar va al titular, sin pasarse del marcador', () => {
    const cambios = [{ sale: 'arq1', entra: 'arq2', minuto: 20 }];

    // Un gol sin minuto y un marcador confirmado mayor que los eventos.
    expect(golesRecibidosPorArquero(['arq2', 'arq1'], ['arq1'], cambios, [25, null], 3)).toEqual(
      new Map([
        ['arq2', 1],
        ['arq1', 2],
      ]),
    );
    // Marcador confirmado menor que los eventos: no se reparte de más.
    expect(golesRecibidosPorArquero(['arq1', 'arq2'], ['arq1'], cambios, [5, 25, 30], 1)).toEqual(
      new Map([
        ['arq1', 1],
        ['arq2', 0],
      ]),
    );
  });
});
