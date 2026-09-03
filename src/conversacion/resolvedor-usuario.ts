import type { MensajeEntrante } from '../channels/channel.types';

/**
 * Puerto para resolver quién escribe.
 *
 * Vive acá y no en `identidad/` para que la capa de canal y el motor puedan
 * pedir el usuario sin importar el módulo de dominio: el motor sigue sin saber
 * qué es una academia.
 */
export interface ResolvedorUsuario {
  resolverUsuario(mensaje: MensajeEntrante): Promise<string>;
}

export const RESOLVEDOR_USUARIO = Symbol('RESOLVEDOR_USUARIO');
