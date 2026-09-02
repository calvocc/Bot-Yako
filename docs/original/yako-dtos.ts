// ============================================================
// Yako — DTOs (NestJS + class-validator)
//
// Organizado por módulo, siguiendo yako-arquitectura-nestjs.md.
// Cada Scene/handler de Telegram arma uno de estos DTOs antes de
// llamar al service correspondiente — así el service nunca recibe
// datos sin validar, sin importar si vinieron de un botón o de
// texto libre.
// ============================================================

import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsDateString,
  ValidateNested,
  ArrayMinSize,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================================
// ENUMS COMPARTIDOS (reflejan los enums de yako-schema.sql)
// ============================================================

export enum RolEquipo {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export enum ModoCargaPartido {
  EN_VIVO = 'en_vivo',
  POST_PARTIDO = 'post_partido',
}

export enum EstadoPartido {
  PENDIENTE = 'pendiente',
  EN_PROGRESO = 'en_progreso',
  CERRADO = 'cerrado',
}

export enum EstadoTiempo {
  NO_INICIADO = 'no_iniciado',
  EN_CURSO = 'en_curso',
  FINALIZADO = 'finalizado',
}

export enum TipoEvento {
  GOL = 'gol',
  AUTOGOL = 'autogol',
  ASISTENCIA = 'asistencia',
  TARJETA_AMARILLA = 'tarjeta_amarilla',
  TARJETA_ROJA = 'tarjeta_roja',
  CAMBIO = 'cambio',
}

export enum EquipoOrigenEvento {
  PROPIO = 'propio',
  RIVAL = 'rival',
}

// ============================================================
// MÓDULO: usuarios
// ============================================================

/** Se arma automáticamente desde el contexto de Telegraf, no la escribe el usuario. */
export class CrearUsuarioDto {
  @IsInt()
  telegramId: number;

  @IsString()
  @Length(1, 120)
  nombre: string;
}

export class CambiarRolDto {
  @IsUUID()
  usuarioObjetivoId: string;

  @IsUUID()
  equipoId: string;

  @IsEnum(RolEquipo)
  nuevoRol: RolEquipo;

  /** Quién ejecuta el cambio — lo valida el RolGuard, no este DTO. */
  @IsUUID()
  ejecutadoPor: string;
}

// ============================================================
// MÓDULO: academias
// ============================================================

export class CrearAcademiaDto {
  @IsString()
  @Length(2, 120)
  nombre: string;

  @IsUUID()
  creadoPor: string; // se vuelve Admin automáticamente
}

// ============================================================
// MÓDULO: equipos
// ============================================================

export class CrearEquipoDto {
  @IsUUID()
  academiaId: string;

  @IsString()
  @Length(2, 80)
  nombre: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  cantidadTiemposDefault?: number; // si no viene, se usa el preset sugerido por categoría

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(50)
  minutosPorTiempoDefault?: number;

  @IsUUID()
  creadoPor: string;
}

export class ActualizarFormatoEquipoDto {
  @IsUUID()
  equipoId: string;

  @IsInt()
  @Min(1)
  @Max(6)
  cantidadTiemposDefault: number;

  @IsInt()
  @Min(5)
  @Max(50)
  minutosPorTiempoDefault: number;
}

// ============================================================
// MÓDULO: invitaciones
// ============================================================

export class CrearInvitacionDto {
  @IsUUID()
  equipoId: string;

  @IsEnum(RolEquipo)
  rol: RolEquipo; // no admite 'admin' a nivel de negocio — se valida en el service

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  vigenciaDias?: number; // default: 7

  @IsUUID()
  creadoPor: string;
}

export class CanjearInvitacionDto {
  @IsString()
  @Length(6, 20)
  codigo: string;

  @IsUUID()
  usuarioId: string;
}

// ============================================================
// MÓDULO: jugadores
// ============================================================

export class CrearJugadorDto {
  @IsUUID()
  equipoId: string;

  @IsString()
  @Length(1, 80)
  nombre: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  dorsal?: number;

  @IsOptional()
  @IsUUID()
  personaId?: string; // enlaza con otro equipo si el jugador ya existe en la academia
}

export class ActualizarJugadorDto {
  @IsUUID()
  jugadorId: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  dorsal?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

// ============================================================
// MÓDULO: partidos
// ============================================================

class FormatoPartidoDto {
  @IsInt()
  @Min(1)
  @Max(6)
  cantidadTiempos: number;

  @IsInt()
  @Min(5)
  @Max(50)
  minutosPorTiempo: number;
}

export class CrearPartidoDto {
  @IsUUID()
  equipoId: string;

  @IsString()
  @Length(1, 120)
  rival: string;

  @IsDateString()
  fecha: string; // ISO date, ej. "2026-09-02"

  @IsOptional()
  @IsString()
  @Length(1, 80)
  competencia?: string;

  /** Si no viene, el service hereda el formato default del equipo. */
  @IsOptional()
  @ValidateNested()
  @Type(() => FormatoPartidoDto)
  formatoPersonalizado?: FormatoPartidoDto;

  @IsUUID()
  creadoPor: string;
}

export class SeleccionarModoCargaDto {
  @IsUUID()
  partidoId: string;

  @IsEnum(ModoCargaPartido)
  modo: ModoCargaPartido;

  @IsUUID()
  seleccionadoPor: string;
}

export class IniciarTiempoDto {
  @IsUUID()
  partidoId: string;

  @IsUUID()
  usuarioId: string;

  @IsOptional()
  @IsBoolean()
  automatico?: boolean; // true cuando lo dispara un evento sin botón explícito (RF-3.8)
}

export class FinalizarTiempoDto {
  @IsUUID()
  partidoId: string;

  @IsUUID()
  usuarioId: string;
}

export class FinalizarPartidoDto {
  @IsUUID()
  partidoId: string;

  @IsUUID()
  usuarioId: string;

  @IsInt()
  @Min(0)
  marcadorPropioConfirmado: number;

  @IsInt()
  @Min(0)
  marcadorRivalConfirmado: number;
}

export class ReabrirPartidoDto {
  @IsUUID()
  partidoId: string;

  @IsUUID()
  adminId: string; // el RolGuard exige rol admin para este DTO
}

// ============================================================
// MÓDULO: eventos (carga en vivo)
// ============================================================

export class RegistrarEventoDto {
  @IsUUID()
  partidoId: string;

  @IsEnum(TipoEvento)
  tipo: TipoEvento;

  @IsEnum(EquipoOrigenEvento)
  equipoOrigen: EquipoOrigenEvento;

  @IsOptional()
  @IsUUID()
  jugadorId?: string; // ausente = autogol del rival sin jugador propio identificado

  @IsUUID()
  reportadoPor: string;
}

/** Respuesta del service cuando SÍ encontró una posible coincidencia. */
export class DuplicadoDetectadoDto {
  @IsUUID()
  eventoExistenteId: string;

  @IsString()
  reportadoPorNombre: string;

  @IsInt()
  segundosDesdeRegistro: number;

  @ValidateNested()
  @Type(() => RegistrarEventoDto)
  eventoTentativo: RegistrarEventoDto; // se reenvía si el usuario confirma "es otro"
}

export class ConfirmarDuplicadoDto {
  @ValidateNested()
  @Type(() => RegistrarEventoDto)
  eventoTentativo: RegistrarEventoDto;

  @IsBoolean()
  esEventoDistinto: boolean; // true = "Es otro gol", false = "Ya estaba registrado"
}

export class DeshacerEventoDto {
  @IsUUID()
  partidoId: string;

  @IsUUID()
  usuarioId: string; // el service busca el último evento propio de este usuario en este partido

  @IsOptional()
  @IsBoolean()
  comoAdmin?: boolean; // true = puede deshacer eventos de cualquier usuario
}

// ============================================================
// MÓDULO: modo-post-partido
// ============================================================

class GoleadorDto {
  @IsUUID()
  jugadorId: string;

  @IsInt()
  @Min(1)
  @Max(20)
  cantidad: number;
}

class TarjetaDto {
  @IsUUID()
  jugadorId: string;

  @IsEnum(['amarilla', 'roja'])
  color: 'amarilla' | 'roja';
}

export class CargarResumenPostPartidoDto {
  @IsUUID()
  partidoId: string;

  @IsInt()
  @Min(0)
  marcadorPropio: number;

  @IsInt()
  @Min(0)
  marcadorRival: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoleadorDto)
  goleadores?: GoleadorDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TarjetaDto)
  tarjetas?: TarjetaDto[];

  @IsUUID()
  cargadoPor: string;
}

// ============================================================
// MÓDULO: estadisticas
// ============================================================

export class ConsultarStatsJugadorDto {
  @IsUUID()
  equipoId: string;

  /** Búsqueda por nombre libre (ej. "Jacob") — el service resuelve al jugador_id. */
  @IsString()
  @Length(1, 80)
  nombreJugador: string;
}

export class ConsultarTablaDto {
  @IsUUID()
  equipoId: string;

  @IsOptional()
  @IsInt()
  temporada?: number; // año — si no viene, usa la temporada en curso
}

export class ListarPartidosDto {
  @IsUUID()
  equipoId: string;

  @IsOptional()
  @IsEnum(EstadoPartido)
  filtrarPorEstado?: EstadoPartido;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number; // default: 10
}
