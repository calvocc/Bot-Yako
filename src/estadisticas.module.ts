import { Module, type OnModuleInit } from '@nestjs/common';
import { ConversacionModule } from './conversacion/conversacion.module';
import { Router } from './conversacion/router.service';
import { EstadisticasHandler } from './estadisticas/estadisticas.handler';
import { EstadisticasService } from './estadisticas/estadisticas.service';
import { IdentidadModule } from './identidad/identidad.module';

/**
 * `/stats` y `/tabla` (RF-6).
 *
 * No depende de `PartidosModule` ni `OrganizacionModule`: consulta las
 * vistas `estadisticas_jugador`/`estadisticas_equipo` con SQL crudo en vez de
 * pasar por `EventosService`/`JugadoresService`, así que solo necesita
 * `MembresiasService` (para resolver los equipos del usuario) y la conexión
 * a la base, que es global.
 */
@Module({
  imports: [ConversacionModule, IdentidadModule],
  providers: [EstadisticasService, EstadisticasHandler],
})
export class EstadisticasModule implements OnModuleInit {
  constructor(
    private readonly router: Router,
    private readonly handler: EstadisticasHandler,
  ) {}

  onModuleInit(): void {
    this.router.registrarComando('stats', {
      tipo: 'respuesta',
      ejecutar: (ctx, usuarioId) => this.handler.stats(ctx.argumento, usuarioId),
    });

    this.router.registrarComando('tabla', {
      tipo: 'respuesta',
      ejecutar: (_ctx, usuarioId) => this.handler.tabla(usuarioId),
    });
  }
}
