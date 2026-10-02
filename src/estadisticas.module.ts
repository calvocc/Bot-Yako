import { Module, type OnModuleInit } from '@nestjs/common';
import { ConversacionModule } from './conversacion/conversacion.module';
import { Router } from './conversacion/router.service';
import { EstadisticasHandler } from './estadisticas/estadisticas.handler';
import { EstadisticasService } from './estadisticas/estadisticas.service';
import { IdentidadModule } from './identidad/identidad.module';
import { OrganizacionModule } from './organizacion.module';
import { PartidosModule } from './partidos.module';

/**
 * `/stats` y `/tabla` (RF-6).
 *
 * Los eventos y el marcador se siguen consultando con SQL crudo contra las
 * vistas `estadisticas_*` en vez de pasar por `EventosService`, pero los
 * minutos por partido de la ficha (`/stats`) sí usan `PartidosModule`
 * (`PartidosService`, `TiemposService` y `AlineacionService`). Además depende
 * de `OrganizacionModule` (para `JugadoresService`) e `IdentidadModule`
 * (`MembresiasService`, para resolver los equipos del usuario).
 */
@Module({
  imports: [ConversacionModule, IdentidadModule, OrganizacionModule, PartidosModule],
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
