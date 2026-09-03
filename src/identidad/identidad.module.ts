import { Global, Module } from '@nestjs/common';
import { RESOLVEDOR_USUARIO } from '../conversacion/resolvedor-usuario';
import { IdentidadService } from './identidad.service';
import { MembresiasService } from './membresias.service';
import { PermisosFlujo } from './permisos.flujo';

/**
 * Global porque casi todo flujo necesita saber quién escribe y qué puede hacer.
 */
@Global()
@Module({
  providers: [
    IdentidadService,
    MembresiasService,
    PermisosFlujo,
    { provide: RESOLVEDOR_USUARIO, useExisting: IdentidadService },
  ],
  exports: [IdentidadService, MembresiasService, PermisosFlujo, RESOLVEDOR_USUARIO],
})
export class IdentidadModule {}
