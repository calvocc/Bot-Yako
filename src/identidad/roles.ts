/**
 * Roles por equipo, ordenados de menor a mayor privilegio.
 *
 * La jerarquía es acumulativa: quien es admin puede todo lo de editor, y quien
 * es editor puede todo lo de viewer. Tenerla en un solo lugar evita el
 * "si es admin o editor" repetido por todo el código.
 */
export const ROLES = ['viewer', 'editor', 'admin'] as const;
export type Rol = (typeof ROLES)[number];

const NIVEL: Record<Rol, number> = { viewer: 0, editor: 1, admin: 2 };

/** ¿`rol` alcanza el mínimo exigido? */
export function cumpleRol(rol: Rol, minimo: Rol): boolean {
  return NIVEL[rol] >= NIVEL[minimo];
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  viewer: 'Viewer — solo consulta',
  editor: 'Editor — puede cargar eventos',
  admin: 'Admin — control total',
};

export const ETIQUETA_ROL_CORTA: Record<Rol, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Admin',
};
