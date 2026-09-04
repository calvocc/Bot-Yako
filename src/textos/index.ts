import { textos as comunes } from './comunes';
import { textos as equipos } from './equipos';
import { textos as estadisticas } from './estadisticas';
import { textos as invitaciones } from './invitaciones';
import { textos as jugadores } from './jugadores';
import { textos as onboarding } from './onboarding';
import { textos as pasosComunes } from './pasos-comunes';
import { textos as partidos } from './partidos';
import { textos as permisos } from './permisos';
import { textos as resumen } from './resumen';
import { textos as router } from './router';

/**
 * Catálogo centralizado de todos los textos y botones que ve un usuario.
 *
 * Un archivo por dominio (mismo patrón que `src/db/schema/`), todos
 * reexportados acá: cambiar cualquier mensaje del bot es editar una función
 * en un solo lugar, sin rastrear en qué `.flujo.ts` vive. El dominio de
 * eventos (panel en vivo, bitácora) queda aparte en `src/eventos/mensajes.ts`
 * — ya seguía este mismo patrón desde antes de este catálogo.
 *
 * Ningún call site importa este índice todavía (cada uno importa su archivo
 * de dominio directo); queda como el punto único al que engancharse el día
 * que haga falta importar el catálogo completo. `index.spec.ts` compara esta
 * lista contra los archivos que de verdad existen en el directorio, así que
 * agregar un dominio nuevo sin registrarlo acá (o viceversa) rompe el test en
 * vez de desincronizarse en silencio.
 */
export const textos = {
  comunes,
  pasosComunes,
  onboarding,
  equipos,
  jugadores,
  invitaciones,
  permisos,
  partidos,
  resumen,
  estadisticas,
  router,
};
