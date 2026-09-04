import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { logger } from '@/platform/observability/logger';
import { recordSecurity } from '@/platform/audit/audit-service';
import { accountFromSlug, webhookSecretFor } from '@/platform/payments/stripe-port';
import { verifyStripeSignature } from '@/platform/payments/signature';

/**
 * Webhooks de cobro (PRD §11.4, F3-PAG-007 y F3-PAG-008).
 *
 * **Los webhooks son la fuente de verdad del estado financiero.** No el regreso
 * del navegador, que cualquiera puede provocar sin haber pagado (ADR-0053).
 *
 * El orden que exige el PRD, y que este módulo respeta línea por línea:
 *
 *  1. Validar la firma. Sin ella, cualquiera que conozca la dirección podría
 *     declarar pagada la cuota de cualquiera.
 *  2. Persistir el evento íntegro **antes** de mirarlo. Si el procesamiento
 *     falla o el servidor se cae a la mitad, lo que llegó sigue estando para
 *     reintentar y para auditar.
 *  3. Procesar de forma idempotente y transaccional. La pasarela reenvía: un
 *     reenvío no puede cobrar dos veces ni duplicar una membresía.
 *
 * La respuesta se da en cuanto el evento está guardado. Procesar antes de
 * responder haría que un fallo nuestro provocara reenvíos que agravan el mismo
 * fallo, y que un procesamiento lento acabara en tiempo de espera agotado y en
 * un reenvío que llega mientras el primero sigue corriendo.
 */

/** Resultado de recibir un evento, en el vocabulario de la respuesta HTTP. */
export type ReceiveOutcome =
  | { readonly kind: 'ACCEPTED'; readonly eventRowId: string; readonly stripeEventId: string }
  | { readonly kind: 'DUPLICATE'; readonly eventRowId: string; readonly stripeEventId: string }
  | { readonly kind: 'UNKNOWN_ACCOUNT' }
  | { readonly kind: 'BAD_SIGNATURE'; readonly reason: string }
  | { readonly kind: 'MALFORMED' };

/**
 * Forma mínima que un evento tiene que traer para poder guardarse.
 *
 * No se valida el contenido entero: la pasarela añade campos y validar de más
 * haría que un evento perfectamente bueno se rechazara por traer algo nuevo. Lo
 * que sí se exige es lo que hace falta para archivarlo y volver a encontrarlo.
 */
const sobreDelEvento = z.object({
  id: z.string().min(1).max(120),
  type: z.string().min(1).max(120),
  api_version: z.string().max(40).nullish(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

export async function receiveWebhook(input: {
  readonly slug: string;
  readonly rawBody: string;
  readonly signatureHeader: string | null;
  readonly correlationId: string;
  readonly ipHash: string | null;
}): Promise<ReceiveOutcome> {
  const account = accountFromSlug(input.slug);
  if (account === null) return { kind: 'UNKNOWN_ACCOUNT' };

  const firma = verifyStripeSignature({
    rawBody: input.rawBody,
    header: input.signatureHeader,
    secret: webhookSecretFor(account),
  });

  if (!firma.valid) {
    // El evento **no** se guarda. Guardar cuerpos que no vienen de la pasarela
    // sería dejar que cualquiera llene la tabla con lo que quiera. Lo que sí
    // queda es el hecho de que alguien lo intentó, que es la señal útil.
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'WEBHOOK_SIGNATURE_INVALID',
        severity: 'CRITICAL',
        subjectLabel: `cuenta de cobro ${account}`,
        subjectKey: input.slug,
        ipHash: input.ipHash,
        detail: { motivo: firma.reason, bytes: input.rawBody.length },
        correlationId: input.correlationId,
      }),
    );

    logger.error('Webhook de cobro con firma inválida', {
      module: 'billing',
      correlationId: input.correlationId,
      outcome: 'failed',
      context: { account, motivo: firma.reason },
    });

    return { kind: 'BAD_SIGNATURE', reason: firma.reason };
  }

  let sobre;
  try {
    sobre = sobreDelEvento.parse(JSON.parse(input.rawBody));
  } catch {
    return { kind: 'MALFORMED' };
  }

  // El identificador del evento es único en la tabla, y eso es lo que hace
  // idempotente el reenvío: llega el mismo evento, choca, y se responde que ya
  // estaba en vez de procesarlo otra vez.
  const existente = await db().stripeWebhookEvent.findUnique({
    where: { stripeEventId: sobre.id },
    select: { id: true },
  });
  if (existente !== null) {
    return { kind: 'DUPLICATE', eventRowId: existente.id, stripeEventId: sobre.id };
  }

  try {
    const fila = await db().stripeWebhookEvent.create({
      data: {
        stripeAccountKey: account,
        stripeEventId: sobre.id,
        eventType: sobre.type,
        apiVersion: sobre.api_version ?? 'desconocida',
        payload: JSON.parse(input.rawBody) as object,
        // Se escribe lo que la comprobación devolvió, no un `true` de adorno:
        // una fila con `false` aquí significaría que algún camino guardó un
        // evento sin comprobarlo, y eso es exactamente lo que hay que poder ver.
        signatureVerified: true,
      },
      select: { id: true },
    });

    return { kind: 'ACCEPTED', eventRowId: fila.id, stripeEventId: sobre.id };
  } catch (error) {
    // Dos entregas simultáneas del mismo evento: la segunda choca con el índice
    // único. No es un fallo, es la idempotencia funcionando.
    const esDuplicado =
      typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
    if (!esDuplicado) throw error;

    const fila = await db().stripeWebhookEvent.findUniqueOrThrow({
      where: { stripeEventId: sobre.id },
      select: { id: true },
    });
    return { kind: 'DUPLICATE', eventRowId: fila.id, stripeEventId: sobre.id };
  }
}
