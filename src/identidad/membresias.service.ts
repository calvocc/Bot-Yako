import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DbService, type EjecutorDb } from '../db/db.service';
import {
  academias,
  equipos,
  jugadores,
  usuarios,
  usuariosEquipos,
  usuariosJugadores,
} from '../db/schema';
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
   *
   * Incluye los equipos alcanzables solo por ser papá/tutor de un jugador ahí
   * (Frente B: `usuarios_jugadores`), con rol `'viewer'` — un papá ve todo el
   * equipo de su hijo, igual que un Viewer normal. Si además tiene una fila
   * directa en `usuarios_equipos` para ese mismo equipo, esa es la que manda
   * (puede ser un rol mayor, nunca uno menor a viewer).
   */
  async equiposDe(usuarioId: string, rolMinimo?: Rol): Promise<EquipoDelUsuario[]> {
    const directos = await this.db.db
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
      .where(eq(usuariosEquipos.usuarioId, usuarioId));

    const porHijo = await this.db.db
      .selectDistinct({
        equipoId: equipos.id,
        equipoNombre: equipos.nombre,
        academiaId: academias.id,
        academiaNombre: academias.nombre,
      })
      .from(usuariosJugadores)
      .innerJoin(jugadores, eq(jugadores.id, usuariosJugadores.jugadorId))
      .innerJoin(equipos, eq(equipos.id, jugadores.equipoId))
      .innerJoin(academias, eq(academias.id, equipos.academiaId))
      .where(eq(usuariosJugadores.usuarioId, usuarioId));

    const yaDirectos = new Set(directos.map((d) => d.equipoId));
    const combinados: EquipoDelUsuario[] = [
      ...directos,
      ...porHijo
        .filter((e) => !yaDirectos.has(e.equipoId))
        .map((e) => ({ ...e, rol: 'viewer' as const })),
    ].sort(
      (a, b) =>
        a.academiaNombre.localeCompare(b.academiaNombre) ||
        a.equipoNombre.localeCompare(b.equipoNombre),
    );

    return rolMinimo ? combinados.filter((f) => cumpleRol(f.rol, rolMinimo)) : combinados;
  }

  async rolEn(usuarioId: string, equipoId: string, tx?: EjecutorDb): Promise<Rol | null> {
    const ejecutor = tx ?? this.db.db;
    const [fila] = await ejecutor
      .select({ rol: usuariosEquipos.rol })
      .from(usuariosEquipos)
      .where(and(eq(usuariosEquipos.usuarioId, usuarioId), eq(usuariosEquipos.equipoId, equipoId)))
      .limit(1);

    if (fila) return fila.rol;

    // Sin fila directa: ¿es papá/tutor de algún jugador de este equipo?
    const [vinculo] = await ejecutor
      .select({ jugadorId: usuariosJugadores.jugadorId })
      .from(usuariosJugadores)
      .innerJoin(jugadores, eq(jugadores.id, usuariosJugadores.jugadorId))
      .where(and(eq(usuariosJugadores.usuarioId, usuarioId), eq(jugadores.equipoId, equipoId)))
      .limit(1);

    return vinculo ? 'viewer' : null;
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

  /**
   * Alta o cambio de rol. Es idempotente: volver a asignar el mismo rol no falla.
   *
   * Acepta un ejecutor de transacción para poder participar de una operación
   * mayor. Crear un equipo y volver admin a su creador tienen que ser atómicos:
   * un equipo sin admin no se puede administrar, y su nombre ya quedó ocupado.
   */
  async asignarRol(usuarioId: string, equipoId: string, rol: Rol, tx?: EjecutorDb): Promise<void> {
    await (tx ?? this.db.db)
      .insert(usuariosEquipos)
      .values({ usuarioId, equipoId, rol })
      .onConflictDoUpdate({
        target: [usuariosEquipos.usuarioId, usuariosEquipos.equipoId],
        set: { rol },
      });
  }

  /**
   * Vincula a un usuario como papá/tutor de un jugador (Frente B). Sin rol
   * que actualizar —a diferencia de `asignarRol`— así que un segundo vínculo
   * al mismo jugador simplemente no hace nada.
   */
  async vincularAJugador(usuarioId: string, jugadorId: string, tx?: EjecutorDb): Promise<void> {
    await (tx ?? this.db.db)
      .insert(usuariosJugadores)
      .values({ usuarioId, jugadorId })
      .onConflictDoNothing();
  }

  /** Jugadores a los que el usuario está vinculado como papá/tutor, para `/mishijos`. */
  async hijosDe(
    usuarioId: string,
  ): Promise<{ jugadorId: string; jugadorNombre: string; equipoNombre: string }[]> {
    return this.db.db
      .select({
        jugadorId: jugadores.id,
        jugadorNombre: jugadores.nombre,
        equipoNombre: equipos.nombre,
      })
      .from(usuariosJugadores)
      .innerJoin(jugadores, eq(jugadores.id, usuariosJugadores.jugadorId))
      .innerJoin(equipos, eq(equipos.id, jugadores.equipoId))
      .where(eq(usuariosJugadores.usuarioId, usuarioId))
      .orderBy(asc(jugadores.nombre));
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
