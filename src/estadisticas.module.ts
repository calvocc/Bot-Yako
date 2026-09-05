import { Module, type OnModuleInit } from '@nestjs/common';
import { ConversacionModule } from './conversacion/conversacion.module';
import { Router } from './conversacion/router.service';
import { EstadisticasHandler } from './estadisticas/estadisticas.handler';
import { EstadisticasService } from './estadisticas/estadisticas.service';
import { IdentidadModule } from './identidad/identidad.module';
import { OrganizacionModule } from './organizacion.module';

/**
 * `/stats` y `/tabla` (RF-6).
 *
 * No depende de `PartidosModule`: los eventos y el marcador siguen
 * consultándose con SQL crudo contra las vistas `estadisticas_*` en vez de
 * pasar por `EventosService`. Sí depende de `OrganizacionModule` (para
 * `JugadoresService`, que usa `/stats` sin argumento para listar la
 * plantilla) además de `IdentidadModule` (`MembresiasService`, para resolver
 * los equipos del usuario) y la conexión a la base, que es global.
 */
@Module({
  imports: [ConversacionModule, IdentidadModule, OrganizacionModule],
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
