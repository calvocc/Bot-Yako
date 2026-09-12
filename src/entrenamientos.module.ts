import { Module, type OnModuleInit } from '@nestjs/common';
import { ConversacionModule } from './conversacion/conversacion.module';
import { FlowRegistry } from './conversacion/flow-registry.service';
import { Router } from './conversacion/router.service';
import { AsistenciaFlujo, FLUJO_ASISTENCIA } from './entrenamientos/asistencia.flujo';
import { AsistenciaHandler } from './entrenamientos/asistencia.handler';
import { EntrenamientosService } from './entrenamientos/entrenamientos.service';
import {
  FLUJO_NUEVO_ENTRENAMIENTO,
  NuevoEntrenamientoFlujo,
} from './entrenamientos/nuevo-entrenamiento.flujo';
import { OrganizacionModule } from './organizacion.module';

/**
 * Entrenamientos y asistencia: `/nuevoentrenamiento`, `/asistencia`,
 * `/asistencias`.
 *
 * Depende de `OrganizacionModule` por `JugadoresService` (la plantilla que
 * se marca presente/ausente); `MembresiasService` no hace falta importarla
 * -- `IdentidadModule` es `@Global()`.
 */
@Module({
  imports: [ConversacionModule, OrganizacionModule],
  providers: [EntrenamientosService, NuevoEntrenamientoFlujo, AsistenciaFlujo, AsistenciaHandler],
})
export class EntrenamientosModule implements OnModuleInit {
  constructor(
    private readonly registro: FlowRegistry,
    private readonly router: Router,
    private readonly nuevoEntrenamiento: NuevoEntrenamientoFlujo,
    private readonly asistencia: AsistenciaFlujo,
    private readonly handler: AsistenciaHandler,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.nuevoEntrenamiento.construir());
    this.registro.registrar(this.asistencia.construir());

    this.router.registrarComando('nuevoentrenamiento', {
      tipo: 'flujo',
      flujoId: FLUJO_NUEVO_ENTRENAMIENTO,
    });

    this.router.registrarComando('asistencia', { tipo: 'flujo', flujoId: FLUJO_ASISTENCIA });

    this.router.registrarComando('asistencias', {
      tipo: 'respuesta',
      ejecutar: (ctx, usuarioId) => this.handler.asistencias(ctx.argumento, usuarioId),
    });
  }
}
