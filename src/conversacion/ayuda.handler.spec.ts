import type { MembresiasService } from '../identidad/membresias.service';
import { AyudaHandler } from './ayuda.handler';
import type { Router } from './router.service';

const routerFalso = {
  comandosRegistrados: ['ayuda', 'stats', 'nuevopartido', 'permisos', 'cancelar'],
} as unknown as Router;

function membresiasCon(...roles: ('viewer' | 'editor' | 'admin')[]): MembresiasService {
  return {
    equiposDe: () => Promise.resolve(roles.map((rol) => ({ rol }))),
  } as unknown as MembresiasService;
}

describe('AyudaHandler', () => {
  it('sin usuarioId (todavía no hay cuenta), solo muestra lo que es "cualquiera"', async () => {
    const handler = new AyudaHandler(routerFalso, membresiasCon());

    const { texto } = await handler.ejecutar(undefined);

    expect(texto).toContain('/ayuda');
    expect(texto).toContain('/cancelar');
    expect(texto).not.toContain('/stats');
    expect(texto).not.toContain('/nuevopartido');
    expect(texto).not.toContain('/permisos');
  });

  it('un Viewer ve las consultas, pero no lo que requiere Editor ni Admin', async () => {
    const handler = new AyudaHandler(routerFalso, membresiasCon('viewer'));

    const { texto } = await handler.ejecutar('user-1');

    expect(texto).toContain('/stats');
    expect(texto).not.toContain('/nuevopartido');
    expect(texto).not.toContain('/permisos');
  });

  it('un Admin ve el catálogo completo de lo registrado', async () => {
    const handler = new AyudaHandler(routerFalso, membresiasCon('admin'));

    const { texto } = await handler.ejecutar('user-2');

    expect(texto).toContain('/stats');
    expect(texto).toContain('/nuevopartido');
    expect(texto).toContain('/permisos');
  });
});
