import { derivarEnCancha } from './alineacion';

describe('derivarEnCancha', () => {
  it('sin cambios, la cancha es la titular', () => {
    expect(derivarEnCancha(['jacob', 'andres'], [])).toEqual(new Set(['jacob', 'andres']));
  });

  it('un cambio saca a uno y mete al otro', () => {
    const enCancha = derivarEnCancha(['jacob', 'andres'], [{ sale: 'jacob', entra: 'samuel' }]);

    expect(enCancha).toEqual(new Set(['andres', 'samuel']));
  });

  it('encadena varios cambios en orden', () => {
    // Jacob sale, entra Samuel; más tarde Samuel sale, entra Camilo.
    const enCancha = derivarEnCancha(
      ['jacob', 'andres'],
      [
        { sale: 'jacob', entra: 'samuel' },
        { sale: 'samuel', entra: 'camilo' },
      ],
    );

    expect(enCancha).toEqual(new Set(['andres', 'camilo']));
  });

  it('sin titular no hay nadie en cancha, aunque haya cambios', () => {
    // No debería pasar en la práctica (el gate exige titular antes de poder
    // cargar cambios), pero la función no asume nada sobre eso.
    expect(derivarEnCancha([], [{ sale: 'jacob', entra: 'samuel' }])).toEqual(new Set(['samuel']));
  });
});
