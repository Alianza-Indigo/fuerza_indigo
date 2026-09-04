import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import type { SiteMetricEvent } from '@prisma-client/enums';

/**
 * Lectura de la medición agregada.
 *
 * Existe porque un dato que nadie puede consultar no es una medición: es un
 * archivo que crece. Se lee desde el panel de salud técnica, que es donde ya se
 * mira cómo va el sitio.
 *
 * El tráfico automatizado se excluye por omisión. Un informe que suma los
 * rastreadores dice que la portada tuvo tres mil visitas y lleva a decidir sobre
 * un número que no corresponde a ninguna persona.
 */

export interface RouteCount {
  readonly route: string;
  readonly count: number;
}

export interface SiteReport {
  readonly desde: Date;
  readonly paginasVistas: number;
  readonly porRuta: readonly RouteCount[];
  readonly busquedasConResultados: number;
  readonly busquedasSinResultados: number;
  readonly preferenciasGuardadas: number;
  readonly pantallasSinConexion: number;
  readonly visitasDeRastreadores: number;
}

async function total(event: SiteMetricEvent, desde: Date, incluirBots: boolean): Promise<number> {
  const agregado = await db().siteMetric.aggregate({
    where: {
      event,
      occurredAtHour: { gte: desde },
      ...(incluirBots ? {} : { userAgentClass: { not: 'BOT' } }),
    },
    _sum: { count: true },
  });
  return agregado._sum.count ?? 0;
}

export async function siteReport(
  actor: ActorContext,
  options: { dias?: number } = {},
): Promise<UseCaseResult<SiteReport>> {
  const decision = can(actor, 'system.health.read', { kind: 'SiteMetric' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const dias = Math.min(Math.max(options.dias ?? 7, 1), 90);
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  desde.setUTCMinutes(0, 0, 0);

  const porRuta = await db().siteMetric.groupBy({
    by: ['route'],
    where: { event: 'PAGE_VIEW', occurredAtHour: { gte: desde }, userAgentClass: { not: 'BOT' } },
    _sum: { count: true },
    orderBy: { _sum: { count: 'desc' } },
    take: 20,
  });

  const [paginasVistas, conResultados, sinResultados, preferencias, sinConexion, rastreadores] = await Promise.all([
    total('PAGE_VIEW', desde, false),
    total('SEARCH_WITH_RESULTS', desde, false),
    total('SEARCH_WITHOUT_RESULTS', desde, false),
    total('PREFERENCES_SAVED', desde, false),
    total('OFFLINE_FALLBACK', desde, false),
    db()
      .siteMetric.aggregate({
        where: { event: 'PAGE_VIEW', occurredAtHour: { gte: desde }, userAgentClass: 'BOT' },
        _sum: { count: true },
      })
      .then((agregado) => agregado._sum.count ?? 0),
  ]);

  return ok({
    desde,
    paginasVistas,
    porRuta: porRuta.map((fila) => ({ route: fila.route, count: fila._sum.count ?? 0 })),
    busquedasConResultados: conResultados,
    busquedasSinResultados: sinResultados,
    preferenciasGuardadas: preferencias,
    pantallasSinConexion: sinConexion,
    visitasDeRastreadores: rastreadores,
  });
}
