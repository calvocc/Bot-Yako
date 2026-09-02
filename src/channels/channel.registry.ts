import { Injectable } from '@nestjs/common';
import type { ChannelAdapter } from './channel-adapter.interface';
import type { Canal } from './channel.types';

/** Adaptadores activos, indexados por canal. */
@Injectable()
export class ChannelRegistry {
  private readonly adaptadores = new Map<Canal, ChannelAdapter>();

  registrar(adaptador: ChannelAdapter): void {
    this.adaptadores.set(adaptador.canal, adaptador);
  }

  obtener(canal: Canal): ChannelAdapter {
    const adaptador = this.adaptadores.get(canal);

    if (!adaptador) {
      throw new Error(`No hay adaptador registrado para el canal "${canal}"`);
    }

    return adaptador;
  }

  get canalesActivos(): Canal[] {
    return [...this.adaptadores.keys()];
  }
}
