import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain, territorialReach } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import type { CaseDomain, CasePriority, CaseRiskKind } from '@prisma-client/enums';
import { compartimentoDe } from '../domain/access';
import { filtroTerritorial } from './assignment';

/**
 * Lo que hay que atender antes que el resto (PRD §10.2; alcance de la Fase 6).
 *
 * **Una alerta no es un estado guardado.** Todo lo que se enseña aquí se
 * deriva al leer: un plazo que ya pasó, un expediente crítico que nadie ha
 * contestado, una marca de riesgo que nadie ha recogido. Guardarlo obligaría a
 * un trabajo periódico que lo mantuviera al día, y entre pasada y pasada la
 * pantalla diría que no hay nada urgente cuando sí lo hay. Eso es peor que no
 * tener alertas: es una promesa de que alguien está mirando.
 *
 * **El orden lo decide el daño, no la novedad.** Primero el riesgo inmediato
 * que nadie ha recogido, después lo que ya venció, después lo crítico sin
 * primera respuesta. Una bandeja ordenada por fecha entierra exactamente lo que
 * lleva más tiempo sin atenderse.
 *
 * **Solo lo propio.** Se ve lo que se lleva, en el compartimento y el territorio
 * de quien pregunta: la misma frontera que el detalle, derivada del mismo
 * alcance.
 */

export type ClaseDeAlerta = 'RIESGO_SIN_RECOGER' | 'PLAZO_VENCIDO' | 'SIN_PRIMERA_RESPUESTA' | 'TAREA_VENCIDA';

export interface Alerta {
  readonly clase: ClaseDeAlerta;
  readonly caseId: string;
  readonly publicId: string;
  readonly folio: string;
  readonly prioridad: CasePriority;
  readonly detalle: string;
  /** Desde cuándo espera. Es lo que ordena dentro de cada clase. */
  readonly desde: Date;
  readonly riesgo: CaseRiskKind | null;
}

/** Cuánto puede esperar un expediente su primera respuesta, según su prioridad. */
const HORAS_PARA_LA_PRIMERA_RESPUESTA: Record<CasePriority, number> = {
  CRITICAL: 4,
  HIGH: 24,
  NORMAL: 72,
  LOW: 168,
};

/** El orden en que importan las clases de alerta. Menor va antes. */
const PESO: Record<ClaseDeAlerta, number> = {
  RIESGO_SIN_RECOGER: 0,
  PLAZO_VENCIDO: 1,
  SIN_PRIMERA_RESPUESTA: 2,
  TAREA_VENCIDA: 3,
};

const ABIERTOS = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_THIRD_PARTY', 'REFERRED'] as const;

export async function caseAlerts(actor: ActorContext): Promise<UseCaseResult<readonly Alerta[]>> {
  const userId = actor.userId;
  if (userId === null || userId === undefined) return ok([]);

  const dominios: CaseDomain[] = [];
  if (actor.compartments.has('UNION')) dominios.push('UNION_DEFENSE');
  if (actor.compartments.has('SOCIAL')) dominios.push('SOCIAL_ATTENTION');
  if (dominios.length === 0) return ok([]);

  const decision = can(
    actor,
    'cases.case.read',
    { kind: 'Case', compartment: compartimentoDe(dominios[0]!) },
    { hasLiveAssignment: () => true },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const territorio = filtroTerritorial(territorialReach(actor, 'cases.case.read'));
  const ahora = new Date();

  const expedientes = await db().case.findMany({
    where: {
      domain: { in: dominios },
      status: { in: [...ABIERTOS] },
      assignments: { some: { userId, unassignedAt: null } },
      ...(territorio ?? {}),
    },
    take: 200,
    select: {
      id: true,
      publicId: true,
      folio: true,
      priority: true,
      openedAt: true,
      dueAt: true,
      firstResponseAt: true,
      emergencyFlags: {
        where: { acknowledgedAt: null, closedAt: null },
        orderBy: { raisedAt: 'asc' },
        select: { riskKind: true, raisedAt: true },
      },
      tasks: {
        where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { lt: ahora } },
        orderBy: { dueAt: 'asc' },
        select: { title: true, dueAt: true },
      },
    },
  });

  const alertas: Alerta[] = [];

  for (const expediente of expedientes) {
    const base = {
      caseId: expediente.id,
      publicId: expediente.publicId,
      folio: expediente.folio,
      prioridad: expediente.priority,
    };

    for (const marca of expediente.emergencyFlags) {
      alertas.push({
        ...base,
        clase: 'RIESGO_SIN_RECOGER',
        detalle: 'Hay una marca de riesgo inmediato que nadie ha recogido.',
        desde: marca.raisedAt,
        riesgo: marca.riskKind,
      });
    }

    if (expediente.dueAt !== null && expediente.dueAt < ahora) {
      alertas.push({
        ...base,
        clase: 'PLAZO_VENCIDO',
        detalle: 'El plazo del expediente ya pasó.',
        desde: expediente.dueAt,
        riesgo: null,
      });
    }

    if (expediente.firstResponseAt === null) {
      const limite = new Date(
        expediente.openedAt.getTime() + HORAS_PARA_LA_PRIMERA_RESPUESTA[expediente.priority] * 60 * 60 * 1000,
      );
      if (limite < ahora) {
        alertas.push({
          ...base,
          clase: 'SIN_PRIMERA_RESPUESTA',
          detalle: 'Nadie ha valorado el expediente desde que se abrió.',
          desde: limite,
          riesgo: null,
        });
      }
    }

    // Una sola alerta por expediente, con la tarea que más lleva esperando: una
    // por tarea llenaría la bandeja con el mismo expediente diez veces.
    const tarea = expediente.tasks[0];
    if (tarea !== undefined && tarea.dueAt !== null) {
      alertas.push({
        ...base,
        clase: 'TAREA_VENCIDA',
        detalle:
          expediente.tasks.length === 1
            ? `Tarea fuera de plazo: ${tarea.title}`
            : `${expediente.tasks.length} tareas fuera de plazo. La más antigua: ${tarea.title}`,
        desde: tarea.dueAt,
        riesgo: null,
      });
    }
  }

  alertas.sort(
    (una, otra) => PESO[una.clase] - PESO[otra.clase] || una.desde.getTime() - otra.desde.getTime(),
  );
  return ok(alertas);
}
