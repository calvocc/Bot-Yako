import { Injectable } from '@nestjs/common';
import { AcademiasService } from '../academias/academias.service';
import { botonComando } from '../conversacion/comandos';
import type { ContextoFlujo, Entrada, Flujo, Paso, Transicion } from '../conversacion/flow.types';
import { leerTexto } from '../conversacion/flow.types';
import {
  FORMATOS_SUGERIDOS,
  EquiposService,
  LIMITES_FORMATO,
  NombreDeEquipoRepetidoError,
  parsearFormato,
} from '../equipos/equipos.service';
import { MembresiasService } from '../identidad/membresias.service';
import { ETIQUETA_ROL_CORTA } from '../identidad/roles';
import { InvitacionesService } from '../invitaciones/invitaciones.service';
import { JugadoresService } from '../jugadores/jugadores.service';
import {
  CLAVE_ALTAS,
  pasoCargarPlantilla,
  respuestaPlantillaLista,
} from '../jugadores/pasos-plantilla';
import { mensajeDeCanje } from '../invitaciones/mensajes-canje';

export const FLUJO_ONBOARDING = 'onboarding';

const PASOS = {
  bienvenida: 'bienvenida',
  codigo: 'codigo',
  nombreAcademia: 'nombre-academia',
  nombreEquipo: 'nombre-equipo',
  formato: 'formato',
  formatoCustom: 'formato-custom',
  plantilla: 'plantilla',
} as const;

const CLAVE_ACADEMIA_ID = 'academiaId';
const CLAVE_ACADEMIA_NOMBRE = 'academiaNombre';
const CLAVE_EQUIPO_ID = 'equipoId';
const CLAVE_EQUIPO_NOMBRE = 'equipoNombre';
const CLAVE_NOMBRE_REPETIDO = 'nombreEquipoRepetido';
const CLAVE_ERROR_CANJE = 'errorCanje';

const OPCION_CREAR = 'onb:crear';
const OPCION_CODIGO = 'onb:codigo';
const PREFIJO_FORMATO = 'onb:fmt:';
const OPCION_FORMATO_OTRO = 'onb:fmt:otro';

const CIERRE =
  'Ya puedes crear otro equipo con /nuevoequipo, invitar a los papás con /invitar, o ver tus equipos con /equipos.';

@Injectable()
export class OnboardingFlujo {
  constructor(
    private readonly academias: AcademiasService,
    private readonly equipos: EquiposService,
    private readonly jugadores: JugadoresService,
    private readonly membresias: MembresiasService,
    private readonly invitaciones: InvitacionesService,
  ) {}

  construir(): Flujo {
    return {
      id: FLUJO_ONBOARDING,
      pasoInicial: PASOS.bienvenida,
      pasos: [
        this.pasoBienvenida(),
        this.pasoCodigo(),
        this.pasoNombreAcademia(),
        this.pasoNombreEquipo(),
        this.pasoFormato(),
        this.pasoFormatoCustom(),
        pasoCargarPlantilla(PASOS.plantilla, this.jugadores, {
          claveEquipoId: CLAVE_EQUIPO_ID,
          alTerminar: (_ctx, cargados) => ({
            tipo: 'finalizar',
            respuesta: respuestaPlantillaLista(cargados, CIERRE),
          }),
        }),
      ],
    };
  }

  /**
   * Punto de entrada. Tres caminos: ya tiene equipos, viene con un código en el
   * deep link, o hay que preguntarle qué quiere hacer.
   */
  private pasoBienvenida(): Paso {
    return {
      id: PASOS.bienvenida,

      entrar: async (ctx: ContextoFlujo): Promise<Entrada> => {
        const usuarioId = ctx.usuarioId;

        if (!usuarioId) {
          return { transicion: { tipo: 'finalizar' } };
        }

        // Deep link `t.me/Bot?start=inv_XXXXXX`: se canjea directo, sin
        // hacerle repetir un código que ya venía en el enlace.
        const codigoDelEnlace = ctx.datos.codigoInvitacion;

        if (typeof codigoDelEnlace === 'string' && codigoDelEnlace) {
          return { transicion: await this.canjear(codigoDelEnlace, usuarioId, true) };
        }

        const suyos = await this.membresias.equiposDe(usuarioId);

        if (suyos.length > 0) {
          const lista = suyos
            .map((e) => `• ${e.academiaNombre} — ${e.equipoNombre} (${ETIQUETA_ROL_CORTA[e.rol]})`)
            .join('\n');

          return {
            transicion: {
              tipo: 'finalizar',
              respuesta: {
                texto: `¡Hola de nuevo! Ya estás en:\n\n${lista}\n\n${CIERRE}`,
                botones: [botonComando('ayuda', 'Ver qué puedo hacer')],
              },
            },
          };
        }

        return {
          respuesta: {
            texto:
              '¡Hola! Soy Yako ⚽, llevo las estadísticas de tu academia.\n\nPara empezar, dime:',
            botones: [
              { id: OPCION_CODIGO, texto: 'Tengo invitación' },
              { id: OPCION_CREAR, texto: 'Crear academia' },
            ],
          },
        };
      },

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const eleccion = ctx.mensaje.seleccionId ?? ctx.mensaje.texto?.toLowerCase() ?? '';

        if (eleccion === OPCION_CREAR || eleccion.includes('crear')) {
          return Promise.resolve({ tipo: 'ir', pasoId: PASOS.nombreAcademia });
        }

        if (eleccion === OPCION_CODIGO || eleccion.includes('invitaci')) {
          return Promise.resolve({ tipo: 'ir', pasoId: PASOS.codigo });
        }

        return Promise.resolve({
          tipo: 'repetir',
          respuesta: {
            texto: 'Elige una de las dos opciones:',
            botones: [
              { id: OPCION_CODIGO, texto: 'Tengo invitación' },
              { id: OPCION_CREAR, texto: 'Crear academia' },
            ],
          },
        });
      },
    };
  }

  private pasoCodigo(): Paso {
    return {
      id: PASOS.codigo,

      entrar: (ctx: ContextoFlujo) => {
        // Si venimos rebotados de un enlace con código inválido, se explica el
        // motivo antes de volver a pedirlo.
        const error = leerTexto(ctx.datos, CLAVE_ERROR_CANJE);

        return Promise.resolve({
          respuesta: {
            texto: error
              ? `${error}\n\nPega el código aquí:`
              : 'Pega el código de invitación que te compartieron.',
          },
        });
      },

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const codigo = ctx.mensaje.texto?.trim();

        if (!codigo || !ctx.usuarioId) {
          return {
            tipo: 'repetir',
            respuesta: { texto: 'Necesito el código. Se ve así: YAKO-X7F2A' },
          };
        }

        return this.canjear(codigo, ctx.usuarioId);
      },
    };
  }

  private pasoNombreAcademia(): Paso {
    return {
      id: PASOS.nombreAcademia,

      entrar: () =>
        Promise.resolve({
          respuesta: {
            texto:
              'Perfecto, vas a ser el administrador.\n\n¿Cómo se llama la academia u organización?',
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const nombre = ctx.mensaje.texto?.trim();

        if (!nombre || nombre.length < 2) {
          return {
            tipo: 'repetir',
            respuesta: { texto: 'Necesito un nombre de al menos 2 letras. ¿Cómo se llama?' },
          };
        }

        const academia = await this.academias.crear(nombre);

        return {
          tipo: 'ir',
          pasoId: PASOS.nombreEquipo,
          datos: { [CLAVE_ACADEMIA_ID]: academia.id, [CLAVE_ACADEMIA_NOMBRE]: academia.nombre },
        };
      },
    };
  }

  private pasoNombreEquipo(): Paso {
    return {
      id: PASOS.nombreEquipo,

      entrar: (ctx: ContextoFlujo) => {
        // Al volver por un nombre repetido hay que decir por qué, en vez de
        // repetir el mensaje de bienvenida como si nada hubiera pasado.
        const repetido = ctx.datos[CLAVE_NOMBRE_REPETIDO];
        const nombreRepetido = typeof repetido === 'string' ? repetido : '';

        const texto = nombreRepetido
          ? `Ya tienes un equipo llamado "${nombreRepetido}". Elige otro nombre:`
          : `Academia "${leerTexto(ctx.datos, CLAVE_ACADEMIA_NOMBRE)}" creada ✅\n\nAhora el primer equipo o categoría. ¿Cómo se llama? (por ejemplo: Sub-11)`;

        return Promise.resolve({ respuesta: { texto } });
      },

      recibir: (ctx: ContextoFlujo): Promise<Transicion> => {
        const nombre = ctx.mensaje.texto?.trim();

        if (!nombre) {
          return Promise.resolve({
            tipo: 'repetir',
            respuesta: { texto: '¿Cómo se llama el equipo? (por ejemplo: Sub-11)' },
          });
        }

        return Promise.resolve({
          tipo: 'ir',
          pasoId: PASOS.formato,
          datos: { [CLAVE_EQUIPO_NOMBRE]: nombre, [CLAVE_NOMBRE_REPETIDO]: '' },
        });
      },
    };
  }

  private pasoFormato(): Paso {
    return {
      id: PASOS.formato,

      entrar: (ctx: ContextoFlujo) =>
        Promise.resolve({
          respuesta: {
            texto: `¿Formato de partido para ${leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE)}?`,
            botones: [
              ...FORMATOS_SUGERIDOS.map((f, i) => ({
                id: `${PREFIJO_FORMATO}${i}`,
                texto: f.etiqueta,
              })),
              { id: OPCION_FORMATO_OTRO, texto: 'Otro' },
            ],
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const seleccion = ctx.mensaje.seleccionId;

        if (seleccion === OPCION_FORMATO_OTRO) {
          return { tipo: 'ir', pasoId: PASOS.formatoCustom };
        }

        const formato = seleccion?.startsWith(PREFIJO_FORMATO)
          ? FORMATOS_SUGERIDOS[Number(seleccion.slice(PREFIJO_FORMATO.length))]
          : parsearFormato(ctx.mensaje.texto ?? '');

        if (!formato) {
          return { tipo: 'ir', pasoId: PASOS.formatoCustom };
        }

        return this.crearEquipo(ctx, formato);
      },
    };
  }

  private pasoFormatoCustom(): Paso {
    return {
      id: PASOS.formatoCustom,

      entrar: () =>
        Promise.resolve({
          respuesta: {
            texto: `Escribe el formato como "tiempos x minutos". Por ejemplo: 3 x 20\n\n(entre ${LIMITES_FORMATO.tiemposMin} y ${LIMITES_FORMATO.tiemposMax} tiempos, de ${LIMITES_FORMATO.minutosMin} a ${LIMITES_FORMATO.minutosMax} minutos)`,
          },
        }),

      recibir: async (ctx: ContextoFlujo): Promise<Transicion> => {
        const formato = parsearFormato(ctx.mensaje.texto ?? '');

        if (!formato) {
          return {
            tipo: 'repetir',
            respuesta: { texto: 'No lo entendí. Escríbelo así: 3 x 20' },
          };
        }

        return this.crearEquipo(ctx, formato);
      },
    };
  }

  private async crearEquipo(
    ctx: ContextoFlujo,
    formato: { cantidadTiempos: number; minutosPorTiempo: number },
  ): Promise<Transicion> {
    const academiaId = leerTexto(ctx.datos, CLAVE_ACADEMIA_ID);
    const nombre = leerTexto(ctx.datos, CLAVE_EQUIPO_NOMBRE);

    try {
      const equipo = await this.equipos.crear(academiaId, nombre, formato, ctx.usuarioId ?? '');

      return {
        tipo: 'ir',
        pasoId: PASOS.plantilla,
        datos: { [CLAVE_EQUIPO_ID]: equipo.id, [CLAVE_ALTAS]: 0 },
      };
    } catch (error) {
      if (error instanceof NombreDeEquipoRepetidoError) {
        return {
          tipo: 'ir',
          pasoId: PASOS.nombreEquipo,
          datos: { [CLAVE_NOMBRE_REPETIDO]: nombre },
        };
      }

      throw error;
    }
  }

  /**
   * Canjea y decide la transición según de dónde vino el código.
   *
   * `desdeEnlace` importa: si llegó en el deep link, el usuario está parado en
   * `bienvenida`, cuyo `recibir` solo entiende los dos botones del menú.
   * Repetir ahí lo dejaría atrapado — le diríamos "vuelve a intentar" y luego
   * rechazaríamos el código pegado con "elige una de las dos opciones".
   */
  private async canjear(
    codigo: string,
    usuarioId: string,
    desdeEnlace = false,
  ): Promise<Transicion> {
    const resultado = await this.invitaciones.canjear(codigo, usuarioId);
    const respuesta = mensajeDeCanje(resultado);

    if (resultado.estado === 'ok' || resultado.estado === 'ya_eras_miembro') {
      return { tipo: 'finalizar', respuesta };
    }

    // Un código malo no corta el onboarding: se vuelve a pedir, pero en el
    // paso que sí sabe recibirlo.
    return desdeEnlace
      ? { tipo: 'ir', pasoId: PASOS.codigo, datos: { [CLAVE_ERROR_CANJE]: respuesta.texto } }
      : { tipo: 'repetir', respuesta };
  }
}
