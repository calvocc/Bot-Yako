import { Module, type OnModuleInit } from '@nestjs/common';
import { AcademiasService } from './academias/academias.service';
import { EquiposHandler } from './equipos/equipos.handler';
import { EquiposService } from './equipos/equipos.service';
import { FLUJO_NUEVO_EQUIPO, NuevoEquipoFlujo } from './equipos/nuevo-equipo.flujo';
import { ConversacionModule } from './conversacion/conversacion.module';
import { FlowRegistry } from './conversacion/flow-registry.service';
import { Router } from './conversacion/router.service';
import { PermisosFlujo, FLUJO_PERMISOS } from './identidad/permisos.flujo';
import { FLUJO_INVITAR, InvitarFlujo } from './invitaciones/invitar.flujo';
import { FLUJO_INVITAR_JUGADOR, InvitarJugadorFlujo } from './invitaciones/invitar-jugador.flujo';
import { InvitacionesService } from './invitaciones/invitaciones.service';
import { MisHijosHandler } from './invitaciones/mis-hijos.handler';
import { FLUJO_UNIRME, UnirmeFlujo } from './invitaciones/unirme.flujo';
import { JugadoresService } from './jugadores/jugadores.service';
import { FLUJO_PLANTILLA, PlantillaFlujo } from './jugadores/plantilla.flujo';
import { FLUJO_ONBOARDING, OnboardingFlujo } from './onboarding/onboarding.flujo';
import { codigoDesdeDeepLink } from './invitaciones/invitaciones.service';

/**
 * Academia, equipos, jugadores, invitaciones y permisos: todo lo que existe
 * antes del primer partido.
 *
 * Registra sus flujos y comandos al arrancar, que es lo que además los hace
 * aparecer en /ayuda y en el menú de Telegram.
 */
@Module({
  imports: [ConversacionModule],
  providers: [
    AcademiasService,
    EquiposService,
    EquiposHandler,
    JugadoresService,
    InvitacionesService,
    OnboardingFlujo,
    NuevoEquipoFlujo,
    PlantillaFlujo,
    InvitarFlujo,
    InvitarJugadorFlujo,
    MisHijosHandler,
    UnirmeFlujo,
  ],
  exports: [AcademiasService, EquiposService, JugadoresService, InvitacionesService],
})
export class OrganizacionModule implements OnModuleInit {
  constructor(
    private readonly registro: FlowRegistry,
    private readonly router: Router,
    private readonly onboarding: OnboardingFlujo,
    private readonly nuevoEquipo: NuevoEquipoFlujo,
    private readonly plantilla: PlantillaFlujo,
    private readonly invitar: InvitarFlujo,
    private readonly invitarJugador: InvitarJugadorFlujo,
    private readonly misHijosHandler: MisHijosHandler,
    private readonly unirme: UnirmeFlujo,
    private readonly permisos: PermisosFlujo,
    private readonly equiposHandler: EquiposHandler,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.onboarding.construir());
    this.registro.registrar(this.nuevoEquipo.construir());
    this.registro.registrar(this.plantilla.construir());
    this.registro.registrar(this.invitar.construir());
    this.registro.registrar(this.invitarJugador.construir());
    this.registro.registrar(this.unirme.construir());
    this.registro.registrar(this.permisos.construir());

    // `/start` puede traer el código en el deep link (t.me/Bot?start=inv_XXX):
    // se pasa como dato inicial para canjearlo sin pedirlo de nuevo.
    this.router.registrarComando('start', {
      tipo: 'flujo',
      flujoId: FLUJO_ONBOARDING,
      datosIniciales: (ctx) => {
        const codigo = ctx.argumento ? codigoDesdeDeepLink(ctx.argumento) : null;
        return codigo ? { codigoInvitacion: codigo } : {};
      },
    });

    this.router.registrarComando('nuevoequipo', { tipo: 'flujo', flujoId: FLUJO_NUEVO_EQUIPO });
    this.router.registrarComando('plantilla', { tipo: 'flujo', flujoId: FLUJO_PLANTILLA });
    this.router.registrarComando('invitar', { tipo: 'flujo', flujoId: FLUJO_INVITAR });
    this.router.registrarComando('invitarjugador', {
      tipo: 'flujo',
      flujoId: FLUJO_INVITAR_JUGADOR,
    });
    this.router.registrarComando('permisos', { tipo: 'flujo', flujoId: FLUJO_PERMISOS });

    // `/unirme CODIGO` responde de una; sin argumento abre el flujo.
    this.router.registrarComando('unirme', {
      tipo: 'respuesta',
      ejecutar: async (ctx, usuarioId) => {
        const directo = await this.unirme.manejarDirecto(ctx, usuarioId);
        return directo ?? { tipo: 'delegar' as const, flujoId: FLUJO_UNIRME };
      },
    });

    this.router.registrarComando('equipos', {
      tipo: 'respuesta',
      ejecutar: (_ctx, usuarioId) => this.equiposHandler.listar(usuarioId),
    });

    this.router.registrarComando('mishijos', {
      tipo: 'respuesta',
      ejecutar: (_ctx, usuarioId) => this.misHijosHandler.listar(usuarioId),
    });
  }
}
