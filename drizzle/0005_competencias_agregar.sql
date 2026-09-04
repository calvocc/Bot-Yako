CREATE TABLE "competencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partidos" ADD COLUMN "competencia_id" uuid;--> statement-breakpoint
ALTER TABLE "competencias" ADD CONSTRAINT "competencias_academia_id_academias_id_fk" FOREIGN KEY ("academia_id") REFERENCES "public"."academias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencias" ADD CONSTRAINT "competencias_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competencias_academia_nombre_key" ON "competencias" USING btree ("academia_id",lower(trim("nombre")));--> statement-breakpoint
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE no action ON UPDATE no action;