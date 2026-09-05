CREATE TABLE "usuarios_jugadores" (
	"usuario_id" uuid NOT NULL,
	"jugador_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_jugadores_usuario_id_jugador_id_pk" PRIMARY KEY("usuario_id","jugador_id")
);
--> statement-breakpoint
CREATE TABLE "invitaciones_jugador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jugador_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"usos_maximos" smallint DEFAULT 1 NOT NULL,
	"creado_por" uuid NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"revocada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitaciones_jugador_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "invitaciones_jugador_usos_maximos_check" CHECK ("invitaciones_jugador"."usos_maximos" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "invitaciones_jugador_canjes" (
	"invitacion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"canjeado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitaciones_jugador_canjes_invitacion_id_usuario_id_pk" PRIMARY KEY("invitacion_id","usuario_id")
);
--> statement-breakpoint
ALTER TABLE "usuarios_jugadores" ADD CONSTRAINT "usuarios_jugadores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_jugadores" ADD CONSTRAINT "usuarios_jugadores_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_jugador" ADD CONSTRAINT "invitaciones_jugador_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_jugador" ADD CONSTRAINT "invitaciones_jugador_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_jugador_canjes" ADD CONSTRAINT "invitaciones_jugador_canjes_invitacion_id_invitaciones_jugador_id_fk" FOREIGN KEY ("invitacion_id") REFERENCES "public"."invitaciones_jugador"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_jugador_canjes" ADD CONSTRAINT "invitaciones_jugador_canjes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_usuarios_jugadores_jugador" ON "usuarios_jugadores" USING btree ("jugador_id");--> statement-breakpoint
CREATE INDEX "idx_invitaciones_jugador_codigo" ON "invitaciones_jugador" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "idx_invitaciones_jugador_jugador" ON "invitaciones_jugador" USING btree ("jugador_id");