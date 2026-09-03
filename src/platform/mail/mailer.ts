import { env } from '@/platform/config/env';
import { db } from '@/platform/db/client';
import type { Tx } from '@/platform/db/unit-of-work';
import { logger } from '@/platform/observability/logger';

/**
 * Puerto de correo con adaptadores intercambiables (ADR-0016, PRD §16.2).
 *
 * Todo mensaje parte de una plantilla **versionada** en base de datos: no existe
 * texto de mensaje incrustado en el código. Añadir WhatsApp o SMS es añadir un
 * adaptador a este mismo puerto.
 */

export interface SendMailInput {
  readonly to: string;
  readonly templateCode: string;
  readonly variables: Record<string, string>;
  readonly locale?: string;
  readonly correlationId: string;
}

export interface SendMailResult {
  readonly providerMessageId: string | null;
  readonly rendered: { subject: string; body: string };
}

export interface MailerPort {
  readonly name: string;
  send(input: { to: string; subject: string; body: string; correlationId: string }): Promise<{ providerMessageId: string | null }>;
}

/* -------------------------------------------------------------------------- */
/* Adaptadores                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Desarrollo y pruebas: registra el mensaje sin enviarlo.
 * No escribe el cuerpo, que puede contener enlaces de un solo uso.
 */
const consoleAdapter: MailerPort = {
  name: 'console',
  send: ({ to, subject, correlationId }) => {
    logger.info('Correo no enviado (adaptador de consola)', {
      module: 'mail',
      correlationId,
      context: { to, subject },
    });
    return Promise.resolve({ providerMessageId: null });
  },
};

const resendAdapter: MailerPort = {
  name: 'resend',
  send: async ({ to, subject, body, correlationId }) => {
    const config = env();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.EMAIL_FROM, to: [to], subject, text: body }),
    });

    if (!response.ok) {
      throw new Error(`El proveedor de correo respondió ${response.status}`);
    }
    const payload = (await response.json()) as { id?: string };
    logger.info('Correo entregado al proveedor', { module: 'mail', correlationId });
    return { providerMessageId: payload.id ?? null };
  },
};

const smtpAdapter: MailerPort = {
  name: 'smtp',
  send: () => {
    // El adaptador SMTP institucional se configura cuando la organización decida
    // usar su propio servidor. Declararlo sin implementarlo sería un botón sin
    // acción (PRD §0.3), de modo que falla de forma explícita y comprensible.
    throw new Error(
      'El adaptador SMTP no está configurado. Use EMAIL_PROVIDER=resend o EMAIL_PROVIDER=console mientras tanto.',
    );
  },
};

function adapter(): MailerPort {
  switch (env().EMAIL_PROVIDER) {
    case 'resend':
      return resendAdapter;
    case 'smtp':
      return smtpAdapter;
    case 'console':
      return consoleAdapter;
  }
}

let override: MailerPort | null = null;

/** Solo para pruebas: captura los mensajes sin salida real. */
export function setMailerForTests(port: MailerPort | null): void {
  override = port;
}

/* -------------------------------------------------------------------------- */
/* Renderizado                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Sustituye `{{variable}}` por su valor.
 *
 * Solo se sustituyen las variables **declaradas** en la plantilla: cualquier
 * otra que llegue se descarta, y una declarada que falte deja constancia en el
 * registro en lugar de producir un mensaje con un hueco silencioso.
 */
export function render(
  template: { subject: string | null; bodyTemplate: string; variables: unknown },
  variables: Record<string, string>,
  correlationId: string,
): { subject: string; body: string } {
  const declared = Array.isArray(template.variables) ? (template.variables as string[]) : [];
  const allowed = new Set(declared);

  const missing = declared.filter((name) => variables[name] === undefined);
  if (missing.length > 0) {
    logger.warn('Faltan variables declaradas al renderizar una plantilla', {
      module: 'mail',
      correlationId,
      context: { missing },
    });
  }

  const substitute = (text: string): string =>
    text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
      allowed.has(name) && variables[name] !== undefined ? variables[name] : match,
    );

  return {
    subject: substitute(template.subject ?? ''),
    body: substitute(template.bodyTemplate),
  };
}

/* -------------------------------------------------------------------------- */
/* Envío                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Envía un mensaje a partir de una plantilla publicada y registra el intento.
 *
 * El registro del intento ocurre **siempre**, tanto si el proveedor acepta como
 * si falla: un fallo sin rastro es un fallo que nadie investiga.
 */
export async function sendTemplatedMail(input: SendMailInput): Promise<SendMailResult> {
  const locale = input.locale ?? 'es-MX';

  const template = await db().notificationTemplate.findFirst({
    where: { code: input.templateCode, channel: 'EMAIL', locale, status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
    select: { id: true, subject: true, bodyTemplate: true, variables: true, category: true },
  });

  if (template === null) {
    throw new Error(
      `No hay plantilla publicada para ${input.templateCode} en ${locale}. Las plantillas se administran en base de datos, no en el código.`,
    );
  }

  const rendered = render(template, input.variables, input.correlationId);
  const port = override ?? adapter();

  try {
    const result = await port.send({
      to: input.to,
      subject: rendered.subject,
      body: rendered.body,
      correlationId: input.correlationId,
    });
    return { providerMessageId: result.providerMessageId, rendered };
  } catch (error) {
    logger.error('Falló el envío de correo', {
      module: 'mail',
      correlationId: input.correlationId,
      outcome: 'failed',
      context: { templateCode: input.templateCode, adapter: port.name, error },
    });
    throw error;
  }
}

/**
 * Registra la notificación y su intento de entrega dentro de la transacción del
 * acto que la origina, de modo que no queden avisos huérfanos si el acto se
 * revierte.
 */
export async function recordNotification(
  tx: Tx,
  input: {
    personId: string;
    templateCode: string;
    category: 'GOVERNANCE_MANDATORY' | 'SECURITY' | 'MEMBERSHIP' | 'PAYMENT' | 'CASE' | 'APPOINTMENT' | 'EVENT' | 'PROMOTIONAL';
    title: string;
    body: string;
    providerMessageId: string | null;
    delivered: boolean;
  },
): Promise<void> {
  const template = await tx.notificationTemplate.findFirst({
    where: { code: input.templateCode, channel: 'EMAIL', status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });

  const notification = await tx.notification.create({
    data: {
      personId: input.personId,
      templateId: template?.id ?? null,
      category: input.category,
      title: input.title,
      body: input.body,
      channels: ['EMAIL', 'IN_APP'],
    },
    select: { id: true },
  });

  await tx.deliveryAttempt.create({
    data: {
      notificationId: notification.id,
      channel: 'EMAIL',
      attemptNumber: 1,
      status: input.delivered ? 'SENT' : 'FAILED',
      providerMessageId: input.providerMessageId,
    },
  });
}
