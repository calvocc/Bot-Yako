import { Module, type OnModuleInit } from '@nestjs/common';
import { ConversacionModule } from './conversacion/conversacion.module';
import { FlowRegistry } from './conversacion/flow-registry.service';
import { Router } from './conversacion/router.service';
import { CargarFlujo, CLAVE_DESTINO, FLUJO_CARGAR } from './eventos/cargar.flujo';
import { EventosService } from './eventos/eventos.service';
import { OrganizacionModule } from './organizacion.module';
import { FLUJO_NUEVO_PARTIDO, NuevoPartidoFlujo } from './partidos/nuevo-partido.flujo';
import { PartidosHandler } from './partidos/partidos.handler';
import { PartidosService } from './partidos/partidos.service';
import { FLUJO_REABRIR, ReabrirFlujo } from './partidos/reabrir.flujo';
import { TiemposService } from './partidos/tiempos.service';
import { ResumenService } from './resumen/resumen.service';

/**
 * Partidos, tiempos y carga de eventos.
 *
 * Depende de `OrganizacionModule` porque un partido siempre cuelga de un
 * equipo y sus eventos de una plantilla; al revés no, y esa dirección se
 * mantiene a propósito para que la organización siga teniendo sentido sin
 * ningún partido cargado.
 */
@Module({
  imports: [ConversacionModule, OrganizacionModule],
  providers: [
    PartidosService,
    TiemposService,
    EventosService,
    ResumenService,
    PartidosHandler,
    NuevoPartidoFlujo,
    ReabrirFlujo,
    CargarFlujo,
  ],
  exports: [PartidosService, TiemposService, EventosService, ResumenService],
})
export class PartidosModule implements OnModuleInit {
  constructor(
    private readonly registro: FlowRegistry,
    private readonly router: Router,
    private readonly nuevoPartido: NuevoPartidoFlujo,
    private readonly cargar: CargarFlujo,
    private readonly reabrir: ReabrirFlujo,
    private readonly handler: PartidosHandler,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.nuevoPartido.construir());
    this.registro.registrar(this.cargar.construir());
    this.registro.registrar(this.reabrir.construir());

    this.router.registrarComando('nuevopartido', { tipo: 'flujo', flujoId: FLUJO_NUEVO_PARTIDO });
    this.router.registrarComando('reabrir', { tipo: 'flujo', flujoId: FLUJO_REABRIR });

    // Los tres entran por el mismo flujo y se separan una vez elegido el
    // partido: hasta ahí las preguntas —qué equipo, cuál partido— son idénticas.
    this.router.registrarComando('cargar', { tipo: 'flujo', flujoId: FLUJO_CARGAR });
    this.router.registrarComando('finalizar', {
      tipo: 'flujo',
      flujoId: FLUJO_CARGAR,
      datosIniciales: () => ({ [CLAVE_DESTINO]: 'finalizar' }),
    });
    this.router.registrarComando('deshacer', {
      tipo: 'flujo',
      flujoId: FLUJO_CARGAR,
      datosIniciales: () => ({ [CLAVE_DESTINO]: 'deshacer' }),
    });

    this.router.registrarComando('partidos', {
      tipo: 'respuesta',
      ejecutar: (_ctx, usuarioId) => this.handler.listar(usuarioId),
    });
  }
}
