/** Textos de `/permisos`. */
export const textos = {
  preguntaEquipo: '¿En cuál equipo quieres cambiar permisos?',
  soloElUsuario: (equipoNombre: string) =>
    `En ${equipoNombre} todavía no hay nadie más. Invita con /invitar.`,

  preguntaMiembro: () => '¿A quién le cambias el rol?',
  noCambieNada: () => 'No cambié ningún permiso.',
  yaNoEstaEnElEquipo: () => 'Esa persona ya no está en el equipo.',

  preguntaRol: (nombre: string) => `¿Qué rol le doy a ${nombre}?`,
  unicoAdmin: (nombre: string, equipoNombre: string) =>
    `${nombre} es el único admin de ${equipoNombre}. Nombra a otro admin antes de bajarle el rol.`,
  rolCambiado: (nombre: string, rol: string, equipoNombre: string) =>
    `Listo: ${nombre} ahora es ${rol} en ${equipoNombre} ✅`,
};
