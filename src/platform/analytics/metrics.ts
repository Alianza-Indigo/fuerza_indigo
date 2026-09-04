import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import type { SiteMetricEvent, UserAgentClass } from '@prisma-client/enums';

/**
 * Medición agregada del sitio público (F2-OPS-002).
 *
 * Todo ocurre en el servidor. No hay guion en el navegador, ni baliza, ni
 * cookie, ni identificador: nada que un bloqueador tenga que bloquear y nada
 * que pedir consentimiento para instalar, porque no se instala nada.
 *
 * Lo que se guarda es un contador por combinación de evento, ruta, hora y clase
 * de agente. No existe una fila por visita, así que no hay recorrido que
 * reconstruir ni nada que correlacionar.
 *
 * **Contar nunca puede romper una página.** Si la base no responde, la persona
 * tiene que ver su contenido igual: por eso el fallo se registra y se traga.
 * Una medición que tumba el sitio que mide es peor que no medir.
 */

/**
 * Rutas cuyo contador se lleva con su nombre.
 *
 * Todo lo demás se agrupa. La razón no es de tamaño sino de exposición: una
 * dirección del gestor de contenidos puede llevar dentro el nombre de una
 * delegación pequeña, y un contador por hora sobre ella diría cuándo se leyó
 * algo que en un pueblo lee una sola persona.
 */
const RUTAS_CON_NOMBRE = new Set([
  '/',
  '/accesibilidad',
  '/buscar',
  '/contacto',
  '/noticias',
  '/solicitar-apoyo',
  '/sin-conexion',
]);

/** Prefijos cuyo contenido se agrupa bajo el prefijo, sin la parte variable. */
const PREFIJOS_AGRUPADOS = ['/noticias/', '/legales/'];

/**
 * Reduce una dirección a algo que se puede contar sin señalar a nadie.
 *
 * Quita la consulta y el fragmento —ahí es donde viaja el término de búsqueda—,
 * y todo lo que no esté en la lista se agrupa.
 */
export function rutaMedible(pathname: string): string {
  const limpia = pathname.split('?')[0]?.split('#')[0] ?? '/';
  const normalizada = limpia.length > 1 && limpia.endsWith('/') ? limpia.slice(0, -1) : limpia;

  if (RUTAS_CON_NOMBRE.has(normalizada)) return normalizada;

  for (const prefijo of PREFIJOS_AGRUPADOS) {
    if (normalizada.startsWith(prefijo)) return `${prefijo}*`;
  }

  return '/*';
}

/** Trunca a la hora en punto, en tiempo universal. */
function horaEnPunto(momento: Date): Date {
  const truncada = new Date(momento);
  truncada.setUTCMinutes(0, 0, 0);
  return truncada;
}

export async function record(
  event: SiteMetricEvent,
  input: { route: string; userAgentClass?: UserAgentClass | undefined },
): Promise<void> {
  const route = rutaMedible(input.route);
  const occurredAtHour = horaEnPunto(new Date());
  const userAgentClass = input.userAgentClass ?? 'UNKNOWN';

  try {
    await db().siteMetric.upsert({
      where: {
        event_route_occurredAtHour_userAgentClass: { event, route, occurredAtHour, userAgentClass },
      },
      update: { count: { increment: 1 } },
      create: { event, route, occurredAtHour, userAgentClass, count: 1 },
    });
  } catch (error) {
    logger.warn('No se pudo registrar la medición del sitio', {
      module: 'analytics',
      outcome: 'failed',
      context: { event, route, error },
    });
  }
}
