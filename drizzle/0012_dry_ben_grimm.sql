CREATE TYPE "public"."posicion_jugador" AS ENUM('arquero', 'defensa', 'mediocampista', 'delantero');--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'recuperacion';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'rechazo';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'regate';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'tiro_al_arco';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'falta_recibida';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'atajada';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'penal_atajado';--> statement-breakpoint
ALTER TABLE "jugadores" ADD COLUMN "posicion" "posicion_jugador";--> statement-breakpoint
ALTER TABLE "jugadores" ADD COLUMN "fecha_nacimiento" date;--> statement-breakpoint
ALTER TABLE "jugadores" ADD COLUMN "peso_kg" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "jugadores" ADD COLUMN "estatura_cm" smallint;--> statement-breakpoint
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_peso_check" CHECK ("jugadores"."peso_kg" is null or "jugadores"."peso_kg" between 10 and 120);--> statement-breakpoint
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_estatura_check" CHECK ("jugadores"."estatura_cm" is null or "jugadores"."estatura_cm" between 80 and 210);