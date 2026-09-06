import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
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
  note: z
    .string()
    .trim()
    .min(10, {
      error: () => 'Escribe por qué se canaliza así: es lo que leerá quien reciba el asunto.',
    })
    .max(1000),
});

export type ConfirmRoutingInput = z.infer<typeof confirmRoutingSchema>;

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

  const propuesta = leerPropuesta(solicitud.suggestedRouting);
  const coincide = propuesta !== null && propuesta.entidad === data.legalEntity;

  const confirmadoEl = new Date();
  await transaction(async (tx) => {
    await tx.supportRequest.update({
      where: { id: solicitud.id },
      data: {
        status: 'TRIAGE',
        urgency: data.urgency,
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
      },
    });
  });

  return ok({ folio: solicitud.folio, entidad: data.legalEntity, coincideConLaPropuesta: coincide });
}

/** Cómo se lee una entidad en la pantalla que confirma. */
export { NOMBRE_DE_ENTIDAD };
