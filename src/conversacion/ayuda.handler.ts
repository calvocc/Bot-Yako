import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { textos } from '../textos/router';
import { comandosDisponibles } from './comandos';
import { Router } from './router.service';

/**
 * `/ayuda` se arma desde el catálogo de comandos, así que nunca queda
 * desactualizada respecto de lo que el bot realmente entiende.
 */
@Injectable()
export class AyudaHandler {
  constructor(private readonly router: Router) {}

  ejecutar(): Promise<RespuestaBot> {
    const lineas = comandosDisponibles(this.router.comandosRegistrados).map(
      (comando) =>
        `/${comando.nombre} — ${comando.descripcion}${textos.ayuda.etiquetaRol[comando.rolMinimo]}`,
    );

    return Promise.resolve({
      texto: [textos.ayuda.intro(), '', ...lineas, '', textos.ayuda.cierre()].join('\n'),
    });
  }
}
