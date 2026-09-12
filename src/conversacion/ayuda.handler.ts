import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { MembresiasService } from '../identidad/membresias.service';
import { textos } from '../textos/router';
import { comandosParaUsuario } from './comandos';
import { Router } from './router.service';

/**
 * `/ayuda` se arma desde el catálogo de comandos, así que nunca queda
 * desactualizada respecto de lo que el bot realmente entiende -- y filtrada
 * por lo que el usuario que pregunta puede hacer hoy, no el catálogo entero:
 * sin esto, un Viewer recién unido veía `/nuevopartido` o `/permisos` como si
 * pudiera usarlos.
 */
@Injectable()
export class AyudaHandler {
  constructor(
    private readonly router: Router,
    private readonly membresias: MembresiasService,
  ) {}

  async ejecutar(usuarioId?: string): Promise<RespuestaBot> {
    const equipos = usuarioId ? await this.membresias.equiposDe(usuarioId) : [];
    const lineas = comandosParaUsuario(this.router.comandosRegistrados, equipos).map(
      (comando) =>
        `/${comando.nombre} — ${comando.descripcion}${textos.ayuda.etiquetaRol[comando.rolMinimo]}`,
    );

    return { texto: [textos.ayuda.intro(), '', ...lineas, '', textos.ayuda.cierre()].join('\n') };
  }
}
