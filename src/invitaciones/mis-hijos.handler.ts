import { Injectable } from '@nestjs/common';
import type { RespuestaBot } from '../channels/channel.types';
import { MembresiasService } from '../identidad/membresias.service';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/invitaciones';

/** `/mishijos` — a qué jugadores está vinculado el usuario como papá/tutor (Frente B). */
@Injectable()
export class MisHijosHandler {
  constructor(private readonly membresias: MembresiasService) {}

  async listar(usuarioId?: string): Promise<RespuestaBot> {
    if (!usuarioId) return { texto: textosComunes.primeroUsaStart() };

    const hijos = await this.membresias.hijosDe(usuarioId);

    if (hijos.length === 0) return { texto: textos.mishijos.sinHijos() };

    const lineas = hijos.map((h) => `• ${h.jugadorNombre} — ${h.equipoNombre}`).join('\n');

    return { texto: textos.mishijos.listado(lineas) };
  }
}
