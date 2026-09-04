CREATE TABLE "partido_titulares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partido_id" uuid NOT NULL,
	"jugador_id" uuid NOT NULL,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partido_titulares_partido_jugador_key" UNIQUE("partido_id","jugador_id")
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "jugador_entra_id" uuid;--> statement-breakpoint
ALTER TABLE "partido_titulares" ADD CONSTRAINT "partido_titulares_partido_id_partidos_id_fk" FOREIGN KEY ("partido_id") REFERENCES "public"."partidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partido_titulares" ADD CONSTRAINT "partido_titulares_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partido_titulares" ADD CONSTRAINT "partido_titulares_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_jugador_entra_id_jugadores_id_fk" FOREIGN KEY ("jugador_entra_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_cambio_dos_jugadores_check" CHECK (tipo <> 'cambio' or (jugador_id is not null and jugador_entra_id is not null and jugador_id <> jugador_entra_id));