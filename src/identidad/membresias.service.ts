import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { academias, equipos, usuarios, usuariosEquipos } from '../db/schema';
import { cumpleRol, type Rol } from './roles';

export interface EquipoDelUsuario {
  equipoId: string;
  equipoNombre: string;
  academiaId: string;
  academiaNombre: string;
  rol: Rol;
}

export interface MiembroDelEquipo {
  usuarioId: string;
  nombre: string;
  rol: Rol;
}

@Injectable()
export class MembresiasService {
  constructor(private readonly db: DbService) {}

  /**
   * Equipos a los que pertenece el usuario, opcionalmente filtrados por el rol
   * mínimo que necesita la acción.
   *
   * Filtrar acá es lo que hace que un Viewer no vea siquiera como opción un
   * equipo donde no puede cargar eventos, en vez de dejarlo elegir y negarle
   * el permiso un paso más tarde.
   */
  async equiposDe(usuarioId: string, rolMinimo?: Rol): Promise<EquipoDelUsuario[]> {
    const filas = await this.db.db
      .select({
        equipoId: equipos.id,
        equipoNombre: equipos.nombre,
        academiaId: academias.id,
        academiaNombre: academias.nombre,
        rol: usuariosEquipos.rol,
      })
      .from(usuariosEquipos)
      .innerJoin(equipos, eq(equipos.id, usuariosEquipos.equipoId))
      .innerJoin(academias, eq(academias.id, equipos.academiaId))
      .where(eq(usuariosEquipos.usuarioId, usuarioId))
      .orderBy(asc(academias.nombre), asc(equipos.nombre));

    return rolMinimo ? filas.filter((f) => cumpleRol(f.rol, rolMinimo)) : filas;
  }

  async rolEn(usuarioId: string, equipoId: string): Promise<Rol | null> {
    const [fila] = await this.db.db
      .select({ rol: usuariosEquipos.rol })
      .from(usuariosEquipos)
      .where(and(eq(usuariosEquipos.usuarioId, usuarioId), eq(usuariosEquipos.equipoId, equipoId)))
      .limit(1);

    return fila?.rol ?? null;
  }

  async puede(usuarioId: string, equipoId: string, rolMinimo: Rol): Promise<boolean> {
    const rol = await this.rolEn(usuarioId, equipoId);
    return rol !== null && cumpleRol(rol, rolMinimo);
  }

  /**
   * Admin de la academia = admin de al menos uno de sus equipos.
   *
   * Los roles viven por equipo (así un papá puede ser Editor en el equipo de su
   * hijo y Viewer en otro), pero acciones como crear un equipo nuevo son de
   * alcance académico. Derivarlo así evita una tabla de roles por academia que
   * habría que mantener sincronizada.
   */
  async esAdminDeAcademia(usuarioId: string, academiaId: string): Promise<boolean> {
    const propios = await this.equiposDe(usuarioId, 'admin');
    return propios.some((e) => e.academiaId === academiaId);
  }

  /** Academias donde el usuario puede administrar. */
  async academiasQueAdministra(
    usuarioId: string,
  ): Promise<{ academiaId: string; nombre: string }[]> {
    const propios = await this.equiposDe(usuarioId, 'admin');
    const vistas = new Map<string, string>();

    for (const e of propios) vistas.set(e.academiaId, e.academiaNombre);

    return [...vistas].map(([academiaId, nombre]) => ({ academiaId, nombre }));
  }

  async miembrosDe(equipoId: string): Promise<MiembroDelEquipo[]> {
    return this.db.db
      .select({
        usuarioId: usuarios.id,
        nombre: usuarios.nombre,
        rol: usuariosEquipos.rol,
      })
      .from(usuariosEquipos)
      .innerJoin(usuarios, eq(usuarios.id, usuariosEquipos.usuarioId))
      .where(eq(usuariosEquipos.equipoId, equipoId))
      .orderBy(asc(usuarios.nombre));
  }

  /** Alta o cambio de rol. Es idempotente: volver a asignar el mismo rol no falla. */
  async asignarRol(usuarioId: string, equipoId: string, rol: Rol): Promise<void> {
    await this.db.db
      .insert(usuariosEquipos)
      .values({ usuarioId, equipoId, rol })
      .onConflictDoUpdate({
        target: [usuariosEquipos.usuarioId, usuariosEquipos.equipoId],
        set: { rol },
      });
  }

  /**
   * ¿Queda algún otro admin en el equipo?
   *
   * Se consulta antes de degradar a alguien: un equipo sin admin no puede
   * invitar, ni cambiar roles, ni reabrir partidos. Quedaría bloqueado.
   */
  async hayOtroAdmin(equipoId: string, exceptoUsuarioId: string): Promise<boolean> {
    const miembros = await this.miembrosDe(equipoId);
    return miembros.some((m) => m.rol === 'admin' && m.usuarioId !== exceptoUsuarioId);
  }
}
