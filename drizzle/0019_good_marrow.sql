CREATE TABLE "entrenamiento_presentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entrenamiento_id" uuid NOT NULL,
	"jugador_id" uuid NOT NULL,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entrenamiento_presentes_key" UNIQUE("entrenamiento_id","jugador_id")
);
--> statement-breakpoint
CREATE TABLE "entrenamiento_recurrente_dias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurrente_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	CONSTRAINT "entrenamiento_recurrente_dias_key" UNIQUE("recurrente_id","dia_semana"),
	CONSTRAINT "entrenamiento_recurrente_dias_check" CHECK ("entrenamiento_recurrente_dias"."dia_semana" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "entrenamientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipo_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"recurrente_id" uuid,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entrenamientos_equipo_fecha_key" UNIQUE("equipo_id","fecha")
);
--> statement-breakpoint
CREATE TABLE "entrenamientos_recurrentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipo_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entrenamiento_presentes" ADD CONSTRAINT "entrenamiento_presentes_entrenamiento_id_entrenamientos_id_fk" FOREIGN KEY ("entrenamiento_id") REFERENCES "public"."entrenamientos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenamiento_presentes" ADD CONSTRAINT "entrenamiento_presentes_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenamiento_presentes" ADD CONSTRAINT "entrenamiento_presentes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenamiento_recurrente_dias" ADD CONSTRAINT "entrenamiento_recurrente_dias_recurrente_id_entrenamientos_recurrentes_id_fk" FOREIGN KEY ("recurrente_id") REFERENCES "public"."entrenamientos_recurrentes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenamientos" ADD CONSTRAINT "entrenamientos_equipo_id_equipos_id_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenamientos" ADD CONSTRAINT "entrenamientos_recurrente_id_entrenamientos_recurrentes_id_fk" FOREIGN KEY ("recurrente_id") REFERENCES "public"."entrenamientos_recurrentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenamientos" ADD CONSTRAINT "entrenamientos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenamientos_recurrentes" ADD CONSTRAINT "entrenamientos_recurrentes_equipo_id_equipos_id_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenamientos_recurrentes" ADD CONSTRAINT "entrenamientos_recurrentes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_entrenamientos_equipo_fecha" ON "entrenamientos" USING btree ("equipo_id","fecha" DESC NULLS LAST);--> statement-breakpoint
-- ============================================================
-- C10: RLS deny-all en las tablas nuevas, mismo criterio que 0001/0016.
--
-- El backend accede por conexión directa (dueña de las tablas), así que RLS
-- sin policies no le afecta -- solo cierra el acceso público vía PostgREST.
-- Sin esto estas 4 tablas quedarían expuestas a anon/authenticated, que es
-- justo el hueco que 0016 tuvo que cerrar para las que se habían olvidado.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'entrenamientos_recurrentes', 'entrenamiento_recurrente_dias',
    'entrenamientos', 'entrenamiento_presentes'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;