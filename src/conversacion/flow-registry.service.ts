import { Injectable } from '@nestjs/common';
import type { Flujo, Paso } from './flow.types';

/**
 * Índice de flujos registrados. Cada módulo de dominio registra los suyos
 * al arrancar, así el motor no necesita conocerlos de antemano.
 */
@Injectable()
export class FlowRegistry {
  private readonly flujos = new Map<string, Flujo>();

  registrar(flujo: Flujo): void {
    if (this.flujos.has(flujo.id)) {
      throw new Error(`El flujo "${flujo.id}" ya estaba registrado`);
    }

    if (!flujo.pasos.some((paso) => paso.id === flujo.pasoInicial)) {
      throw new Error(
        `El flujo "${flujo.id}" declara el paso inicial "${flujo.pasoInicial}", que no existe`,
      );
    }

    this.flujos.set(flujo.id, flujo);
  }

  obtener(flujoId: string): Flujo | undefined {
    return this.flujos.get(flujoId);
  }

  obtenerPaso(flujoId: string, pasoId: string): Paso | undefined {
    return this.flujos.get(flujoId)?.pasos.find((paso) => paso.id === pasoId);
  }

  get registrados(): string[] {
    return [...this.flujos.keys()];
  }
}
