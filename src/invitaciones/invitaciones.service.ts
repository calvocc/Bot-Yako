import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { equipos, invitaciones, invitacionesCanjes } from '../db/schema';
import { MembresiasService } from '../identidad/membresias.service';
import type { Rol } from '../identidad/roles';

/**
 * Alfabeto sin caracteres que se confunden al leerlos en voz alta o en una
 * captura de pantalla: nada de 0/O, 1/I/L.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 6;
const PREFIJO = 'YAKO-';

export const VIGENCIA_DIAS_DEFECTO = 7;

export interface Invitacion {
  codigo: string;
  equipoId: string;
  equipoNombre: string;
  rol: Rol;
  usosMaximos: number;
  usados: number;
  expiraEn: Date;
}

export type ResultadoCanje =
  | { estado: 'ok'; equipoId: string; equipoNombre: string; rol: Rol }
  | { estado: 'ya_eras_miembro'; equipoNombre: string; rol: Rol }
  | { estado: 'no_existe' }
  | { estado: 'expirada' }
  | { estado: 'agotada' }
  | { estado: 'revocada' };

@Injectable()
export class InvitacionesService {
  constructor(
    private readonly db: DbService,
    private readonly membresias: MembresiasService,
  ) {}

  async crear(
    equipoId: string,
    rol: Rol,
    creadoPor: string,
    opciones: { usosMaximos?: number; vigenciaDias?: number } = {},
  ): Promise<Invitacion> {
    const expiraEn = new Date();
    expiraEn.setDate(expiraEn.getDate() + (opciones.vigenciaDias ?? VIGENCIA_DIAS_DEFECTO));

    const [fila] = await this.db.db
      .insert(invitaciones)
      .values({
        equipoId,
        codigo: await this.codigoLibre(),
        rol,
        usosMaximos: opciones.usosMaximos ?? 1,
        creadoPor,
        expiraEn,
      })
      .returning();

    const equipo = await this.nombreEquipo(equipoId);

    return {
      codigo: fila.codigo,
      equipoId,
      equipoNombre: equipo,
      rol: fila.rol,
      usosMaximos: fila.usosMaximos,
      usados: 0,
      expiraEn: fila.expiraEn,
    };
  }

  /**
   * Canjea un código y da de alta al usuario en el equipo.
   *
   * Todo ocurre en una transacción y el conteo de usos se hace con un `select
   * count` dentro de ella: dos personas canjeando el último uso a la vez no
   * pueden pasar ambas.
   */
  async canjear(codigoCrudo: string, usuarioId: string): Promise<ResultadoCanje> {
    const codigo = normalizarCodigo(codigoCrudo);

    return this.db.db.transaction(async (tx): Promise<ResultadoCanje> => {
      const [inv] = await tx
        .select()
        .from(invitaciones)
        .where(eq(invitaciones.codigo, codigo))
        // Bloquea la fila hasta el fin de la transacción, que es lo que impide
        // que dos canjes simultáneos superen el límite de usos.
        .for('update')
        .limit(1);

      if (!inv) return { estado: 'no_existe' };
      if (inv.revocadaEn) return { estado: 'revocada' };
      if (inv.expiraEn.getTime() <= Date.now()) return { estado: 'expirada' };

      const equipoNombre = await this.nombreEquipo(inv.equipoId, tx);

      const [yaCanjeo] = await tx
        .select({ usuarioId: invitacionesCanjes.usuarioId })
        .from(invitacionesCanjes)
        .where(
          and(
            eq(invitacionesCanjes.invitacionId, inv.id),
            eq(invitacionesCanjes.usuarioId, usuarioId),
          ),
        )
        .limit(1);

      if (yaCanjeo) {
        return { estado: 'ya_eras_miembro', equipoNombre, rol: inv.rol };
      }

      const [{ usados }] = await tx
        .select({ usados: sql<number>`count(*)::int` })
        .from(invitacionesCanjes)
        .where(eq(invitacionesCanjes.invitacionId, inv.id));

      if (usados >= inv.usosMaximos) return { estado: 'agotada' };

      await tx.insert(invitacionesCanjes).values({ invitacionId: inv.id, usuarioId });

      return { estado: 'ok', equipoId: inv.equipoId, equipoNombre, rol: inv.rol };
    });
  }

  /**
   * El alta en el equipo va fuera de la transacción del canje a propósito: si
   * el usuario ya tenía un rol mayor, `asignarRol` lo bajaría. Se comprueba
   * antes para no degradar a nadie por aceptar una invitación.
   */
  async aplicarCanje(usuarioId: string, equipoId: string, rol: Rol): Promise<Rol> {
    const actual = await this.membresias.rolEn(usuarioId, equipoId);

    if (actual && actual === 'admin') return actual;

    await this.membresias.asignarRol(usuarioId, equipoId, rol);
    return rol;
  }

  async revocar(codigo: string, equipoId: string): Promise<boolean> {
    const filas = await this.db.db
      .update(invitaciones)
      .set({ revocadaEn: new Date() })
      .where(
        and(eq(invitaciones.codigo, normalizarCodigo(codigo)), eq(invitaciones.equipoId, equipoId)),
      )
      .returning({ id: invitaciones.id });

    return filas.length > 0;
  }

  private async codigoLibre(): Promise<string> {
    for (let intento = 0; intento < 10; intento++) {
      const codigo = generarCodigo();
      const [existe] = await this.db.db
        .select({ id: invitaciones.id })
        .from(invitaciones)
        .where(eq(invitaciones.codigo, codigo))
        .limit(1);

      if (!existe) return codigo;
    }

    throw new Error('No se pudo generar un código de invitación libre');
  }

  private async nombreEquipo(
    equipoId: string,
    tx?: { select: DbService['db']['select'] },
  ): Promise<string> {
    const consulta = tx ?? this.db.db;
    const [fila] = await consulta
      .select({ nombre: equipos.nombre })
      .from(equipos)
      .where(eq(equipos.id, equipoId))
      .limit(1);

    return fila?.nombre ?? 'el equipo';
  }
}

export function generarCodigo(): string {
  let cuerpo = '';

  for (let i = 0; i < LARGO_CODIGO; i++) {
    cuerpo += ALFABETO[randomInt(ALFABETO.length)];
  }

  return `${PREFIJO}${cuerpo}`;
}

/** Acepta "yako-x7f2a", "X7F2A" o el código con espacios de más. */
export function normalizarCodigo(crudo: string): string {
  const limpio = crudo.trim().toUpperCase().replace(/\s+/g, '');

  return limpio.startsWith(PREFIJO) ? limpio : `${PREFIJO}${limpio}`;
}

/** Payload del deep link `t.me/Bot?start=inv_XXXXXX`. */
export const PREFIJO_DEEP_LINK = 'inv_';

export function codigoDesdeDeepLink(payload: string): string | null {
  if (!payload.startsWith(PREFIJO_DEEP_LINK)) return null;

  const codigo = payload.slice(PREFIJO_DEEP_LINK.length);

  return codigo ? normalizarCodigo(codigo) : null;
}

export function deepLinkDe(codigo: string, usuarioBot: string): string {
  const sinPrefijo = codigo.replace(PREFIJO, '');
  return `https://t.me/${usuarioBot}?start=${PREFIJO_DEEP_LINK}${sinPrefijo}`;
}
