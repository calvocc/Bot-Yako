import { Module, type OnModuleInit } from '@nestjs/common';
import { AyudaHandler } from './ayuda.handler';
import { FlowEngine } from './flow-engine.service';
import { FlowRegistry } from './flow-registry.service';
import { Router } from './router.service';
import { SesionStore } from './sesion.store';

/**
 * Motor conversacional: recibe mensajes ya normalizados y decide qué responder.
 * No conoce ningún canal.
 */
@Module({
  providers: [SesionStore, FlowRegistry, FlowEngine, Router, AyudaHandler],
  exports: [Router, FlowEngine, FlowRegistry, SesionStore],
})
export class ConversacionModule implements OnModuleInit {
  constructor(
    private readonly router: Router,
    private readonly ayuda: AyudaHandler,
  ) {}

  onModuleInit(): void {
    this.router.registrarComando('ayuda', {
      tipo: 'respuesta',
      ejecutar: () => this.ayuda.ejecutar(),
    });

    // Los demás comandos se registran en las fases siguientes, desde el módulo
    // de dominio dueño de cada uno.
  }
}
