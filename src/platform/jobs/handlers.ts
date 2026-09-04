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

/**
 * La carga de un trabajo llega de la base de datos como JSON: su forma no está
 * garantizada por el tipo. Leer un campo con `String()` convertiría un objeto
 * en «[object Object]» y el trabajo seguiría adelante con un destinatario
 * inventado. Un campo que no es del tipo esperado se trata como ausente, y el
 * manejador falla de forma explícita más abajo.
 */
function textValue(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function stringMap(payload: Record<string, unknown>, key: string): Record<string, string> {
  const value = payload[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [name, item] of Object.entries(value)) {
    if (typeof item === 'string') result[name] = item;
  }
  return result;
}
export type JobHandler = (job: ClaimedJob) => Promise<JobResult>;

const HANDLERS: Record<string, JobHandler> = {
  /**
   * Reenvío de un correo cuyo primer intento falló. El identificador de la
   * notificación es la clave de negocio: reintentarlo no genera un aviso nuevo.
   */
  'mail-retry': async (job) => {
    const to = textValue(job.payload, 'to');
    const templateCode = textValue(job.payload, 'templateCode');
    const variables = stringMap(job.payload, 'variables');

    if (to === '' || templateCode === '') {
      throw new Error('El trabajo de reenvío no trae destinatario ni plantilla.');
    }

    const sent = await sendTemplatedMail({ to, templateCode, variables, correlationId: job.correlationId });
    return { providerMessageId: sent.providerMessageId };
  },

  /**
   * Acuse de recibo de la entrada pública (PRD §10.1, Fase 2).
   *
   * El folio es la clave de negocio, de modo que reintentar no manda dos acuses
   * por el mismo mensaje. Va por la cola y no en línea a propósito: si el
   * proveedor de correo está caído, el mensaje ya está guardado y alguien lo va
   * a leer igual; perder el mensaje por no poder acusarlo sería perder lo único
   * que importa.
   */
  'support-request-acknowledge': async (job) => {
    const to = textValue(job.payload, 'to');
    const templateCode = textValue(job.payload, 'templateCode');
    const variables = stringMap(job.payload, 'variables');

    if (to === '' || templateCode === '') {
      throw new Error('El acuse de la entrada pública no trae destinatario ni plantilla.');
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
