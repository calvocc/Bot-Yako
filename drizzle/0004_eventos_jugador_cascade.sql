ALTER TABLE "eventos" DROP CONSTRAINT "eventos_jugador_id_jugadores_id_fk";
--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;