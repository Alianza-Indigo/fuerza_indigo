import { after } from 'next/server';
import { receiveWebhook } from '@/modules/billing';
import { processWebhookEvent } from '@/modules/billing';
import { requestContext } from '@/platform/http/request-context';
import { logger } from '@/platform/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Entrada de eventos de cobro, una dirección por cuenta (PRD §11.4, F3-PAG-007).
 *
 * Dos direcciones y no una porque son dos personas morales con dos cuentas y
 * dos secretos. Con una sola habría que probar la firma contra los dos secretos
 * para saber de quién viene, y eso significa que un evento firmado por una
 * entidad se aceptaría como si fuera de la otra: exactamente el cruce de
 * cuentas que el PRD §11.2 evita desde el primer día.
 *
 * **El cuerpo se lee en crudo.** La firma cubre los bytes exactos que la
 * pasarela envió; volver a serializar el JSON produce una cadena equivalente
 * con otros bytes, y la firma deja de coincidir. Está probado en
 * `tests/unit/payments/signature.test.ts`.
 *
 * **Se responde en cuanto el evento está guardado**, y el procesamiento ocurre
 * después con `after`. Procesar antes de responder haría que un fallo nuestro
 * provocara reenvíos que agravan el mismo fallo, y que un procesamiento lento
 * acabara en tiempo de espera agotado con un reenvío llegando mientras el
 * primero sigue corriendo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ cuenta: string }> }): Promise<Response> {
  const { cuenta } = await params;
  const context = await requestContext();

  const rawBody = await request.text();

  const recibido = await receiveWebhook({
    slug: cuenta,
    rawBody,
    signatureHeader: request.headers.get('stripe-signature'),
    correlationId: context.correlationId,
    ipHash: context.ipHash,
  });

  switch (recibido.kind) {
    case 'UNKNOWN_ACCOUNT':
      // 404 y no 400: una dirección de cuenta que no existe no es un error de
      // formato, es una dirección que no existe.
      return Response.json({ error: 'cuenta de cobro desconocida' }, { status: 404 });

    case 'BAD_SIGNATURE':
      // El motivo no viaja en la respuesta. Decir «marca de tiempo fuera de
      // tolerancia» o «la firma no coincide» le enseña a quien lo intenta
      // exactamente qué ajustar. Queda en la bitácora de seguridad.
      return Response.json({ error: 'firma no válida' }, { status: 400 });

    case 'MALFORMED':
      return Response.json({ error: 'evento con formato inesperado' }, { status: 400 });

    case 'DUPLICATE':
      // 200 y no un error: el reenvío es normal y la respuesta correcta es
      // «ya lo tengo». Responder error haría que la pasarela siguiera
      // reenviando un evento que está perfectamente procesado.
      logger.info('Evento de cobro repetido', {
        module: 'billing',
        correlationId: context.correlationId,
        context: { stripeEventId: recibido.stripeEventId },
      });
      return Response.json({ received: true, duplicate: true }, { status: 200 });

    case 'ACCEPTED': {
      after(async () => {
        try {
          await processWebhookEvent(recibido.eventRowId, context.correlationId);
        } catch (error) {
          // Nunca se deja escapar: el evento ya está guardado y su reintento
          // es de la tarea programada, no de esta petición, que ya respondió.
          logger.error('Fallo no controlado procesando un evento de cobro', {
            module: 'billing',
            correlationId: context.correlationId,
            outcome: 'failed',
            context: { eventRowId: recibido.eventRowId, error: String(error) },
          });
        }
      });

      return Response.json({ received: true }, { status: 200 });
    }
  }
}
