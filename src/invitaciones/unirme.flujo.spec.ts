import { textoDePrueba } from '../channels/testing/fake.adapter';
import type { ContextoFlujo } from '../conversacion/flow.types';
import type { InvitacionesService, ResultadoCanje } from './invitaciones.service';
import { UnirmeFlujo } from './unirme.flujo';

/**
 * `resultado.estado` decide el desenlace del canje, no el texto ya renderizado
 * (que en la Fase 2 original comparaba substrings como `'✅'`/`'Ya eras'` —
 * un acoplamiento que se rompía en silencio cada vez que se retocaba el copy).
 * Este test fuerza los `ResultadoCanje.estado` posibles —incluidos los dos de
 * Frente B (`ok_jugador`, `ya_vinculado_jugador`), que canjean con el mismo
 * código y el mismo comando que los de equipo— y confirma que el desenlace
 * no depende de una sola palabra del mensaje.
 */
describe('UnirmeFlujo — decide por el estado tipado, no por el texto', () => {
  const ctx: ContextoFlujo = {
    mensaje: textoDePrueba('YAKO-X7F2A'),
    datos: {},
    usuarioId: 'u1',
  };

  const flujoCon = (resultado: ResultadoCanje): UnirmeFlujo => {
    const invitaciones = {
      canjear: () => Promise.resolve(resultado),
    } as unknown as InvitacionesService;

    return new UnirmeFlujo(invitaciones);
  };

  const pasoCodigo = (flujo: UnirmeFlujo) => flujo.construir().pasos[0];

  it.each<[ResultadoCanje, boolean]>([
    [{ estado: 'ok', equipoId: 'e1', equipoNombre: 'Sub-11', rol: 'editor' }, true],
    [{ estado: 'ya_eras_miembro', equipoNombre: 'Sub-11', rol: 'viewer' }, true],
    [
      { estado: 'ok_jugador', jugadorId: 'j1', jugadorNombre: 'Jacob', equipoNombre: 'Sub-11' },
      true,
    ],
    [{ estado: 'ya_vinculado_jugador', jugadorNombre: 'Jacob', equipoNombre: 'Sub-11' }, true],
    [{ estado: 'no_existe' }, false],
    [{ estado: 'expirada' }, false],
    [{ estado: 'agotada' }, false],
    [{ estado: 'revocada' }, false],
  ])('con estado %o, tipo de transición esperado según exitoso=%s', async (resultado, exitoso) => {
    const flujo = flujoCon(resultado);
    const transicion = await pasoCodigo(flujo).recibir!(ctx);

    expect(transicion.tipo).toBe(exitoso ? 'finalizar' : 'repetir');
  });
});
