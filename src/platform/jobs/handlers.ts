import type { ClaimedJob } from '@/platform/jobs/queue';
import { sendTemplatedMail } from '@/platform/mail/mailer';
import { logger } from '@/platform/observability/logger';

/**
 * Manejadores de trabajos de la Fase 1.
 *
 * Cada manejador es idempotente: la clave de negocio del trabajo identifica el
 * efecto, de modo que reintentarlo no lo duplica. Un tipo de trabajo
 * desconocido **falla de forma explícita** en lugar de darse por bueno: un
 * trabajo que se marca como exitoso sin hacer nada es peor que uno que falla.
 */

export type JobResult = Record<string, unknown>;
export type JobHandler = (job: ClaimedJob) => Promise<JobResult>;

const HANDLERS: Record<string, JobHandler> = {
  /**
   * Reenvío de un correo cuyo primer intento falló. El identificador de la
   * notificación es la clave de negocio: reintentarlo no genera un aviso nuevo.
   */
  'mail-retry': async (job) => {
    const to = String(job.payload['to'] ?? '');
    const templateCode = String(job.payload['templateCode'] ?? '');
    const variables = (job.payload['variables'] ?? {}) as Record<string, string>;

    if (to === '' || templateCode === '') {
      throw new Error('El trabajo de reenvío no trae destinatario ni plantilla.');
    }

    const sent = await sendTemplatedMail({ to, templateCode, variables, correlationId: job.correlationId });
    return { providerMessageId: sent.providerMessageId };
  },
};

export async function runJob(job: ClaimedJob): Promise<JobResult> {
  const handler = HANDLERS[job.jobType];
  if (handler === undefined) {
    throw new Error(
      `No hay manejador para el trabajo «${job.jobType}». Regístrelo en src/platform/jobs/handlers.ts antes de encolarlo.`,
    );
  }

  logger.info('Ejecutando trabajo', {
    module: 'jobs',
    correlationId: job.correlationId,
    context: { jobType: job.jobType, attempt: job.attempts + 1 },
  });

  return handler(job);
}

/** Tipos de trabajo con manejador registrado. Lo usa la salud técnica. */
export function knownJobTypes(): string[] {
  return Object.keys(HANDLERS);
}
