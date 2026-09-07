import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { isGenerationAccepted } from '@/modules/ai';
import type { LegalEntityCode, SupportUrgency } from '@prisma-client/enums';
import { NOMBRE_DE_ENTIDAD, type PropuestaDeCanalizacion } from '../domain/routing';

/**
 * Confirmación humana de la canalización (PRD §10.1, §24 Fase 6).
 *
 * «La propuesta automática de canalización no sustituye confirmación humana» es
 * un criterio de aceptación de la fase, y aquí es donde se sostiene: la
 * propuesta se guardó al recibir el mensaje y **no hizo nada**. Ni cambió el
 * estado, ni fijó la prioridad, ni abrió expediente. Todo eso empieza cuando
 * una persona con facultades lo confirma, y queda dicho quién y cuándo.
 *
 * Confirmar **no es estar de acuerdo**: quien confirma puede mandar el asunto a
 * la otra entidad, y por eso la pantalla enseña el motivo de la propuesta y su
 * alternativa. Una confirmación que solo pudiera decir «sí» no sería una
 * confirmación, sería un trámite.
 */

export const confirmRoutingSchema = z.object({
  requestId: z.uuid(),
  /** Entidad que se confirma. Puede no ser la propuesta. */
  legalEntity: z.enum(['FUERZA_INDIGO', 'ALIANZA_INDIGO'] as const satisfies readonly LegalEntityCode[], {
    error: () => 'Elige a qué entidad se canaliza.',
  }),
  /** Prioridad que fija la valoración humana. */
  urgency: z.enum(['ROUTINE', 'PRIORITY', 'URGENT'] as const satisfies readonly SupportUrgency[]),
  /**
   * Territorio ya resuelto. `territoryHint` es lo que la persona escribió —«por
   * el norte de Guadalajara»—; esto es la unidad territorial que quien confirma
   * determina que era. Se resuelve aquí y no al abrir el expediente porque aquí
   * es donde se tiene delante lo que la persona escribió, y ahí ya no.
   */
  territorialUnitId: z.uuid().nullable().default(null),
  note: z
    .string()
    .trim()
    .min(10, {
      error: () => 'Escribe por qué se canaliza así: es lo que leerá quien reciba el asunto.',
    })
    .max(1000),
});

export type ConfirmRoutingInput = z.input<typeof confirmRoutingSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Lee la propuesta guardada. Si no la hay o está corrupta, no se inventa una. */
export function leerPropuesta(valor: unknown): PropuestaDeCanalizacion | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const bruto = valor as Record<string, unknown>;
  const entidad = bruto['entidad'];
  const dominio = bruto['dominio'];
  const urgencia = bruto['urgencia'];
  const motivo = bruto['motivo'];
  if (
    (entidad !== 'FUERZA_INDIGO' && entidad !== 'ALIANZA_INDIGO') ||
    (dominio !== 'UNION_DEFENSE' && dominio !== 'SOCIAL_ATTENTION') ||
    (urgencia !== 'ROUTINE' && urgencia !== 'PRIORITY' && urgencia !== 'URGENT') ||
    typeof motivo !== 'string'
  ) {
    return null;
  }
  const alternativa = bruto['alternativa'];
  return {
    entidad,
    dominio,
    urgencia,
    motivo,
    alternativa: alternativa === 'FUERZA_INDIGO' || alternativa === 'ALIANZA_INDIGO' ? alternativa : null,
    requiereProtocoloDeRiesgo: bruto['requiereProtocoloDeRiesgo'] === true,
  };
}

export async function confirmRouting(
  actor: ActorContext,
  input: ConfirmRoutingInput,
): Promise<UseCaseResult<{ folio: string; entidad: LegalEntityCode; coincideConLaPropuesta: boolean }>> {
  const parsed = confirmRoutingSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const contexto = { ...actor, reason: data.note };
  const decision = can(contexto, 'support.request.triage', { kind: 'SupportRequest' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const solicitud = await db().supportRequest.findUnique({
    where: { id: data.requestId },
    select: {
      id: true,
      folio: true,
      status: true,
      legalEntityId: true,
      suggestedRouting: true,
      suggestedByAiGenerationId: true,
      confirmedById: true,
    },
  });
  if (solicitud === null) return fail(errors.notFound('Esa solicitud no existe.'));

  if (solicitud.confirmedById !== null) {
    return fail(errors.conflict('La canalización de esta solicitud ya está confirmada.'));
  }
  if (solicitud.status !== 'RECEIVED') {
    return fail(
      errors.conflict(
        'Esta solicitud ya se resolvió por otra vía. Canalizar algo ya cerrado confundiría a quien lo reciba.',
        `estado actual ${solicitud.status}`,
      ),
    );
  }

  const quienConfirma = actor.userId;
  if (quienConfirma === null || quienConfirma === undefined) {
    return fail(errors.forbidden('Confirmar una canalización es un acto de una persona: exige una cuenta.'));
  }

  const destino = await db().legalEntity.findUnique({
    where: { code: data.legalEntity },
    select: { id: true },
  });
  if (destino === null) return fail(errors.notFound('Esa entidad no existe.'));

  if (data.territorialUnitId !== null) {
    const unidad = await db().territorialUnit.findUnique({
      where: { id: data.territorialUnitId },
      select: { status: true },
    });
    if (unidad === null) return fail(errors.notFound('Esa unidad territorial no existe.'));
    if (unidad.status !== 'ACTIVE') {
      return fail(
        errors.conflict('Esa unidad territorial no está activa. Elige la que atiende hoy ese territorio.'),
      );
    }
  }

  const propuesta = leerPropuesta(solicitud.suggestedRouting);
  const coincide = propuesta !== null && propuesta.entidad === data.legalEntity;

  // La puerta del bloque F. Cuando la propuesta la sugirió la IA y se va a
  // confirmar **esa misma** canalización, la salida asistida está a punto de
  // surtir efecto: exige que una persona la haya aceptado o corregido antes.
  // Apartarse de la propuesta no se bloquea —ahí la sugerencia no surte efecto,
  // la sustituye la decisión de quien confirma—, y por eso el guardián solo actúa
  // cuando la confirmación coincide con lo que sugirió el modelo (ADR-0151).
  if (solicitud.suggestedByAiGenerationId !== null && coincide) {
    const aceptada = await isGenerationAccepted(solicitud.suggestedByAiGenerationId);
    if (!aceptada) {
      return fail(
        errors.ruleViolation(
          'Esta canalización la sugirió la IA y nadie la ha aceptado todavía. Acéptala o corrígela en la revisión antes de confirmarla; si no estás de acuerdo, canaliza a otra entidad.',
          'confirmación de una canalización sugerida por IA sin revisión aceptada',
        ),
      );
    }
  }

  const confirmadoEl = new Date();
  await transaction(async (tx) => {
    await tx.supportRequest.update({
      where: { id: solicitud.id },
      data: {
        status: 'TRIAGE',
        urgency: data.urgency,
        territorialUnitId: data.territorialUnitId,
        confirmedRoutingLegalEntityId: destino.id,
        confirmedById: quienConfirma,
        confirmedAt: confirmadoEl,
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.SUPPORT_ROUTING_CONFIRMED,
      objectKind: 'SupportRequest',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      reason: data.note,
      metadata: {
        folio: solicitud.folio,
        confirmada: data.legalEntity,
        propuesta: propuesta?.entidad ?? null,
        // Que se apartara de la propuesta es lo interesante de este asiento: si
        // ocurre a menudo, la tabla de clasificación está mal y hay que
        // corregirla. Un registro que solo dijera «confirmado» no lo diría.
        seApartoDeLaPropuesta: !coincide,
        urgencia: data.urgency,
        territorio: data.territorialUnitId,
      },
    });
  });

  return ok({ folio: solicitud.folio, entidad: data.legalEntity, coincideConLaPropuesta: coincide });
}

/** Cómo se lee una entidad en la pantalla que confirma. */
export { NOMBRE_DE_ENTIDAD };

/** Una unidad territorial como la ofrece el desplegable que canaliza. */
export interface OpcionDeTerritorio {
  readonly value: string;
  readonly label: string;
  /** Profundidad en el árbol, para sangrar la lista y que se lea la jerarquía. */
  readonly nivel: number;
}

/**
 * Unidades territoriales activas, para resolver el territorio al canalizar.
 *
 * Va aquí y no en el módulo institucional porque quien canaliza tiene la
 * facultad de clasificar mensajes, no necesariamente la de consultar la
 * estructura territorial. Pedirle las dos para poder decir «esto es de
 * Guadalajara» le daría, de paso, el padrón de delegaciones entero.
 *
 * Solo las activas: una unidad disuelta no atiende a nadie, y ofrecerla en la
 * lista invita a mandarle un asunto.
 */
export async function territoriesForRouting(
  actor: ActorContext,
): Promise<UseCaseResult<readonly OpcionDeTerritorio[]>> {
  const decision = can(
    { ...actor, reason: 'consulta del catálogo territorial para canalizar' },
    'support.request.triage',
    { kind: 'SupportRequest' },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().territorialUnit.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { path: 'asc' },
    select: { id: true, name: true, depth: true },
  });

  return ok(filas.map((fila) => ({ value: fila.id, label: fila.name, nivel: fila.depth })));
}
