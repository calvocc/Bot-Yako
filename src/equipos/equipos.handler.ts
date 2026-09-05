import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { respuestaSinEquipos } from '../conversacion/comandos';
import { describirFormato } from './equipos.service';
import { MembresiasService } from '../identidad/membresias.service';
import { ETIQUETA_ROL_CORTA } from '../identidad/roles';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/equipos';
import { EquiposService } from './equipos.service';

@Injectable()
export class EquiposHandler {
  constructor(
    private readonly membresias: MembresiasService,
    private readonly equipos: EquiposService,
  ) {}

  /** `/equipos` — los equipos del usuario, con su rol y formato. */
  async listar(usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) {
      return { texto: textosComunes.primeroUsaStart() };
    }

    const suyos = await this.membresias.equiposDe(usuarioId);

    if (suyos.length === 0) return respuestaSinEquipos();

    const lineas = await Promise.all(
      suyos.map(async (e) => {
        const equipo = await this.equipos.obtener(e.equipoId);
        const formato = equipo
          ? describirFormato({
              cantidadTiempos: equipo.cantidadTiemposDefault,
              minutosPorTiempo: equipo.minutosPorTiempoDefault,
            })
          : '';

        return `• *${e.academiaNombre} — ${e.equipoNombre}*\n  ${ETIQUETA_ROL_CORTA[e.rol]} · ${formato}`;
      }),
    );

    return { texto: textos.listado(lineas.join('\n')) };
  }
}
