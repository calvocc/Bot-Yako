CREATE TYPE "public"."canal_mensajeria" AS ENUM('telegram', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."equipo_origen_evento" AS ENUM('propio', 'rival');--> statement-breakpoint
CREATE TYPE "public"."estado_partido" AS ENUM('pendiente', 'en_progreso', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."estado_tiempo" AS ENUM('no_iniciado', 'en_curso', 'finalizado');--> statement-breakpoint
CREATE TYPE "public"."modo_carga_partido" AS ENUM('en_vivo', 'post_partido');--> statement-breakpoint
CREATE TYPE "public"."origen_evento" AS ENUM('en_vivo', 'post_partido');--> statement-breakpoint
CREATE TYPE "public"."rol_equipo" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento" AS ENUM('gol', 'autogol', 'asistencia', 'tarjeta_amarilla', 'tarjeta_roja', 'cambio');--> statement-breakpoint
CREATE TABLE "academias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"cantidad_tiempos_default" smallint DEFAULT 2 NOT NULL,
	"minutos_por_tiempo_default" smallint DEFAULT 25 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipos_academia_nombre_key" UNIQUE("academia_id","nombre"),
	CONSTRAINT "equipos_cantidad_tiempos_check" CHECK ("equipos"."cantidad_tiempos_default" between 1 and 6),
	CONSTRAINT "equipos_minutos_por_tiempo_check" CHECK ("equipos"."minutos_por_tiempo_default" between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "jugadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipo_id" uuid NOT NULL,
	"persona_id" uuid,
	"nombre" text NOT NULL,
	"dorsal" smallint,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jugadores_dorsal_check" CHECK ("jugadores"."dorsal" is null or "jugadores"."dorsal" between 0 and 99)
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identidades_usuario" (
	"usuario_id" uuid NOT NULL,
	"canal" "canal_mensajeria" NOT NULL,
	"canal_user_id" text NOT NULL,
	"chat_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identidades_usuario_canal_canal_user_id_pk" PRIMARY KEY("canal","canal_user_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios_equipos" (
	"usuario_id" uuid NOT NULL,
	"equipo_id" uuid NOT NULL,
	"rol" "rol_equipo" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_equipos_usuario_id_equipo_id_pk" PRIMARY KEY("usuario_id","equipo_id")
);
--> statement-breakpoint
CREATE TABLE "invitaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipo_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"rol" "rol_equipo" NOT NULL,
	"usos_maximos" smallint DEFAULT 1 NOT NULL,
	"creado_por" uuid NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"revocada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitaciones_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "invitaciones_usos_maximos_check" CHECK ("invitaciones"."usos_maximos" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "invitaciones_canjes" (
	"invitacion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"canjeado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitaciones_canjes_invitacion_id_usuario_id_pk" PRIMARY KEY("invitacion_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "partido_tiempos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partido_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"iniciado_en" timestamp with time zone NOT NULL,
	"finalizado_en" timestamp with time zone,
	"iniciado_por" uuid,
	"finalizado_por" uuid,
	CONSTRAINT "partido_tiempos_partido_numero_key" UNIQUE("partido_id","numero"),
	CONSTRAINT "partido_tiempos_numero_check" CHECK ("partido_tiempos"."numero" >= 1)
);
--> statement-breakpoint
CREATE TABLE "partidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipo_id" uuid NOT NULL,
	"rival" text NOT NULL,
	"fecha" date NOT NULL,
	"competencia" text,
	"cantidad_tiempos" smallint NOT NULL,
	"minutos_por_tiempo" smallint NOT NULL,
	"modo_carga" "modo_carga_partido",
	"estado" "estado_partido" DEFAULT 'pendiente' NOT NULL,
	"tiempo_actual" smallint DEFAULT 0 NOT NULL,
	"tiempo_estado" "estado_tiempo" DEFAULT 'no_iniciado' NOT NULL,
	"tiempo_iniciado_en" timestamp with time zone,
	"marcador_propio" smallint DEFAULT 0 NOT NULL,
	"marcador_rival" smallint DEFAULT 0 NOT NULL,
	"marcador_propio_confirmado" smallint,
	"marcador_rival_confirmado" smallint,
	"iniciado_por" uuid,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrado_en" timestamp with time zone,
	"cerrado_por" uuid,
	CONSTRAINT "partidos_cantidad_tiempos_check" CHECK ("partidos"."cantidad_tiempos" between 1 and 6),
	CONSTRAINT "partidos_minutos_por_tiempo_check" CHECK ("partidos"."minutos_por_tiempo" between 1 and 60),
	CONSTRAINT "partidos_tiempo_actual_check" CHECK ("partidos"."tiempo_actual" >= 0),
	CONSTRAINT "partidos_marcador_propio_check" CHECK ("partidos"."marcador_propio" >= 0),
	CONSTRAINT "partidos_marcador_rival_check" CHECK ("partidos"."marcador_rival" >= 0)
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partido_id" uuid NOT NULL,
	"tipo" "tipo_evento" NOT NULL,
	"equipo_origen" "equipo_origen_evento" NOT NULL,
	"jugador_id" uuid,
	"tiempo" smallint,
	"minuto_calculado" smallint,
	"origen" "origen_evento" DEFAULT 'en_vivo' NOT NULL,
	"reportado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"eliminado_por" uuid,
	CONSTRAINT "eventos_tiempo_en_vivo_check" CHECK ((origen = 'post_partido') or (tiempo is not null and minuto_calculado is not null)),
	CONSTRAINT "eventos_tiempo_check" CHECK ("eventos"."tiempo" is null or "eventos"."tiempo" >= 1),
	CONSTRAINT "eventos_minuto_check" CHECK ("eventos"."minuto_calculado" is null or "eventos"."minuto_calculado" >= 0),
	CONSTRAINT "eventos_jugador_requerido_check" CHECK (equipo_origen = 'rival' or tipo in ('gol', 'autogol') or jugador_id is not null)
);
--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_academia_id_academias_id_fk" FOREIGN KEY ("academia_id") REFERENCES "public"."academias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_equipo_id_equipos_id_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidades_usuario" ADD CONSTRAINT "identidades_usuario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_equipos" ADD CONSTRAINT "usuarios_equipos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_equipos" ADD CONSTRAINT "usuarios_equipos_equipo_id_equipos_id_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_equipo_id_equipos_id_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_canjes" ADD CONSTRAINT "invitaciones_canjes_invitacion_id_invitaciones_id_fk" FOREIGN KEY ("invitacion_id") REFERENCES "public"."invitaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_canjes" ADD CONSTRAINT "invitaciones_canjes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partido_tiempos" ADD CONSTRAINT "partido_tiempos_partido_id_partidos_id_fk" FOREIGN KEY ("partido_id") REFERENCES "public"."partidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partido_tiempos" ADD CONSTRAINT "partido_tiempos_iniciado_por_usuarios_id_fk" FOREIGN KEY ("iniciado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partido_tiempos" ADD CONSTRAINT "partido_tiempos_finalizado_por_usuarios_id_fk" FOREIGN KEY ("finalizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_equipo_id_equipos_id_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_iniciado_por_usuarios_id_fk" FOREIGN KEY ("iniciado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_partido_id_partidos_id_fk" FOREIGN KEY ("partido_id") REFERENCES "public"."partidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_reportado_por_usuarios_id_fk" FOREIGN KEY ("reportado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_eliminado_por_usuarios_id_fk" FOREIGN KEY ("eliminado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_equipos_academia" ON "equipos" USING btree ("academia_id");--> statement-breakpoint
CREATE INDEX "idx_jugadores_equipo" ON "jugadores" USING btree ("equipo_id") WHERE activo;--> statement-breakpoint
CREATE UNIQUE INDEX "jugadores_equipo_dorsal_key" ON "jugadores" USING btree ("equipo_id","dorsal") WHERE activo and dorsal is not null;--> statement-breakpoint
CREATE INDEX "idx_identidades_usuario" ON "identidades_usuario" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "idx_usuarios_equipos_equipo" ON "usuarios_equipos" USING btree ("equipo_id","rol");--> statement-breakpoint
CREATE INDEX "idx_invitaciones_codigo" ON "invitaciones" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "idx_invitaciones_equipo" ON "invitaciones" USING btree ("equipo_id");--> statement-breakpoint
CREATE INDEX "idx_partidos_equipo_estado" ON "partidos" USING btree ("equipo_id","estado");--> statement-breakpoint
CREATE INDEX "idx_partidos_equipo_fecha" ON "partidos" USING btree ("equipo_id","fecha" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_eventos_dedup" ON "eventos" USING btree ("partido_id","tipo","equipo_origen","creado_en") WHERE eliminado_en is null;--> statement-breakpoint
CREATE INDEX "idx_eventos_partido" ON "eventos" USING btree ("partido_id") WHERE eliminado_en is null;--> statement-breakpoint
CREATE INDEX "idx_eventos_jugador" ON "eventos" USING btree ("jugador_id") WHERE eliminado_en is null;--> statement-breakpoint
CREATE INDEX "idx_eventos_partido_origen" ON "eventos" USING btree ("partido_id","origen") WHERE eliminado_en is null;