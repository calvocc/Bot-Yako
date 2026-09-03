import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { comandosDisponibles } from './comandos';
import { Router } from './router.service';

const ETIQUETA_ROL: Record<string, string> = {
  cualquiera: '',
  viewer: '',
  editor: ' · Editor',
  admin: ' · Admin',
};

/**
 * `/ayuda` se arma desde el catálogo de comandos, así que nunca queda
 * desactualizada respecto de lo que el bot realmente entiende.
 */
@Injectable()
export class AyudaHandler {
  constructor(private readonly router: Router) {}

  ejecutar(): Promise<RespuestaBot> {
    const lineas = comandosDisponibles(this.router.comandosRegistrados).map(
      (comando) => `/${comando.nombre} — ${comando.descripcion}${ETIQUETA_ROL[comando.rolMinimo]}`,
    );

    return Promise.resolve({
      texto: [
        'Soy Yako ⚽, llevo las estadísticas de tu academia.',
        '',
        ...lineas,
        '',
        'Si te pierdes en algún paso, escribe /cancelar.',
      ].join('\n'),
    });
  }
}
