import * as fs from 'fs';
import { textos } from './index';

const kebabACamel = (nombre: string) =>
  nombre.replace(/-([a-z])/g, (_, letra: string) => letra.toUpperCase());

/**
 * Nadie importa `textos` desde acá todavía — ver el comentario de `index.ts`.
 * Mientras eso sea así, lo único que evita que este índice se desincronice
 * de los dominios reales (agregar un archivo y olvidar registrarlo acá, o
 * borrar uno y dejar la entrada colgando) es este test.
 */
describe('textos (índice agregador)', () => {
  it('registra exactamente un módulo por cada archivo de dominio en src/textos', () => {
    const archivosDeDominio = fs
      .readdirSync(__dirname)
      .filter(
        (archivo) =>
          archivo.endsWith('.ts') && !archivo.endsWith('.spec.ts') && archivo !== 'index.ts',
      )
      .map((archivo) => archivo.replace(/\.ts$/, ''));

    const esperados = archivosDeDominio.map(kebabACamel).sort();
    const registrados = Object.keys(textos).sort();

    expect(registrados).toEqual(esperados);
  });
});
