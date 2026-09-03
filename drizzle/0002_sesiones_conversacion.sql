CREATE TABLE "sesiones_conversacion" (
	"canal" "canal_mensajeria" NOT NULL,
	"canal_user_id" text NOT NULL,
	"flujo_id" text NOT NULL,
	"paso_id" text NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sesiones_conversacion_canal_canal_user_id_pk" PRIMARY KEY("canal","canal_user_id")
);
--> statement-breakpoint
CREATE INDEX "idx_sesiones_expiracion" ON "sesiones_conversacion" USING btree ("expira_en");--> statement-breakpoint
-- Coherente con C10: RLS activo sin policies deja la tabla inaccesible para
-- cualquiera que no sea el backend (que es su dueño y por eso no queda sujeto).
ALTER TABLE "sesiones_conversacion" ENABLE ROW LEVEL SECURITY;
