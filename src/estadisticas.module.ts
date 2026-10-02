import { Module, type OnModuleInit } from '@nestjs/common';
import { ConversacionModule } from './conversacion/conversacion.module';
import { FlowRegistry } from './conversacion/flow-registry.service';
import { Router } from './conversacion/router.service';
import { EstadisticasHandler } from './estadisticas/estadisticas.handler';
import { EstadisticasService } from './estadisticas/estadisticas.service';
import { FLUJO_STATS_PARTIDOS, StatsPartidosFlujo } from './estadisticas/stats-partidos.flujo';
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
  providers: [EstadisticasService, EstadisticasHandler, StatsPartidosFlujo],
})
export class EstadisticasModule implements OnModuleInit {
  constructor(
    private readonly registro: FlowRegistry,
    private readonly router: Router,
    private readonly handler: EstadisticasHandler,
    private readonly partidosFlujo: StatsPartidosFlujo,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.partidosFlujo.construir());

    this.router.registrarComando('stats', {
      tipo: 'respuesta',
      ejecutar: (ctx, usuarioId) => this.handler.stats(ctx.argumento, usuarioId),
    });

    this.router.registrarComando('tabla', {
      tipo: 'respuesta',
      ejecutar: (ctx, usuarioId) => this.handler.tabla(ctx.argumento, usuarioId),
    });

    // Atajo interno, solo alcanzable por el botón `📅 Partidos` de la ficha
    // (no va en el catálogo de /ayuda): entra al flujo con el jugador ya
    // elegido, igual que `continuarcarga` tras /reabrir.
    this.router.registrarComando('statspartidos', {
      tipo: 'flujo',
      flujoId: FLUJO_STATS_PARTIDOS,
      datosIniciales: (ctx) => ({ statsJugadorId: ctx.argumento ?? '' }),
    });
  }
}
