-- Solo los valores nuevos del enum. El CHECK que los usa (y las vistas/
-- trigger que también los mencionan) van en la migración siguiente: Postgres
-- no permite usar un valor de enum recién agregado en la misma transacción
-- en que se agregó, y cada migración corre en su propia transacción
-- (`src/db/migrate.ts`) -- mismo motivo por el que 0012/0013 están separadas.
ALTER TYPE "public"."tipo_evento" ADD VALUE 'gol_penal';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'gol_tiro_libre';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'tiro_afuera';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'pase';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'falta_cometida';