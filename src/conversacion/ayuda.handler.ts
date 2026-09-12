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

    return {
      texto: [textos.ayuda.intro(), '', ...lineas, '', textos.ayuda.cierre()].join('\n'),
      // Quien pide /ayuda ya está preguntando qué puede hacer: es el momento
      // natural para sincronizar también el "/" nativo de Telegram. Sin esto,
      // alguien a quien /permisos le cambió el rol EN EL MISMO equipo no
      // tenía ninguna acción propia para refrescar su menú nativo -- ninguno
      // de los otros disparadores (unirse a un equipo nuevo, crear equipo o
      // academia) cubre ese caso.
      actualizarMenu: true,
    };
  }
}
