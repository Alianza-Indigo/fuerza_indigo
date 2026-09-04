import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { fingerprint } from '@/platform/kernel/ids';
import { env } from '@/platform/config/env';
import { enqueue } from '@/platform/jobs/queue';
import { logger } from '@/platform/observability/logger';
import type { LegalEntityCode, SupportRequestType } from '@prisma-client/enums';

/**
 * Entrada pública: contacto y solicitud inicial (PRD §10.1, Fase 2).
 *
 * Es el único caso de uso de la plataforma que atiende a alguien **sin cuenta y
 * sin permiso**. Eso cambia tres cosas respecto de todos los demás:
 *
 *  · No hay política que consultar. El control no es «quién eres» sino «cuánto
 *    puedes hacer desde donde estás», y por eso hay un límite por origen.
 *  · No hay consentimiento granular que otorgar, porque no hay persona en el
 *    padrón a la que atarlo. Lo que sí hay es un aviso de privacidad aceptado,
 *    y se guarda **qué versión exacta** se aceptó.
 *  · No se audita el envío. La bitácora registra actos de la organización, y
 *    quien escribe no ejecuta ninguno: la fila con su fecha es el registro. Lo
 *    que sí se audita es leerla y hacerse cargo de ella (`inbox.ts`).
 *
 * El aviso de privacidad **tiene que estar publicado** para que el formulario
 * acepte nada. No es una formalidad: recabar datos personales sin aviso vigente
 * es exactamente lo que la ley prohíbe, y un sistema que lo permitiera pondría
 * a la organización a incumplir sin que nadie se diera cuenta.
 */

/** Código del aviso de privacidad que rige esta entrada. */
export const PUBLIC_INTAKE_NOTICE_CODE = 'PRIVACY_NOTICE_PUBLIC_INTAKE';

/** Tipos que puede elegir quien escribe. Son los del PRD §10.1 más el contacto general. */
export const REQUEST_TYPES = [
  'GENERAL_CONTACT',
  'INDIVIDUAL_LABOR_DISPUTE',
  'COLLECTIVE_DISPUTE',
  'DISCRIMINATION_OR_ADJUSTMENTS',
  'EDUCATION_ACCESS',
  'HEALTH_ACCESS',
  'ACCESSIBILITY',
  'FAMILY_GUIDANCE',
  'CIAN_ATTENTION',
  'PSYCHOSOCIAL_RISK',
  'VIOLENCE_OR_URGENCY',
  'TRAINING_OR_INSTITUTIONAL_SUPPORT',
  'OTHER',
] as const satisfies readonly SupportRequestType[];

/**
 * Cuántos mensajes admite un mismo origen por hora.
 *
 * Se cuentan los envíos **logrados**, no los fallidos: en un formulario abierto
 * el abuso consiste en enviar mucho, no en equivocarse mucho. El número deja
 * sitio de sobra a quien escribe dos veces porque se le olvidó un dato, y corta
 * el envío automatizado en serie.
 */
export const INTAKE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxSubmissions: 5 } as const;

/**
 * Campo de texto que puede venir vacío.
 *
 * Un formulario HTML manda la cadena vacía, nunca `undefined`, así que sin esto
 * un campo opcional que nadie llenó fallaría la validación del formato. La
 * cadena vacía se trata como ausencia antes de validar nada.
 */
function opcional<T extends z.ZodType<string, string>>(esquema: T) {
  return z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
    esquema.optional(),
  );
}

export const submitRequestSchema = z
  .object({
    requestType: z.enum(REQUEST_TYPES, {
      error: () => 'Elige de qué se trata tu mensaje.',
    }),
    legalEntity: z.enum(['FUERZA_INDIGO', 'ALIANZA_INDIGO'] as const satisfies readonly LegalEntityCode[]),
    contactName: z
      .string()
      .trim()
      .min(2, { error: () => 'Dinos cómo quieres que te llamemos.' })
      .max(120),
    contactEmail: opcional(z.email({ error: () => 'Revisa el correo: parece que le falta algo.' }).max(254)),
    contactPhone: opcional(
      z
        .string()
        .max(30)
        .regex(/^[0-9+()\s-]{7,30}$/, { error: () => 'El teléfono solo lleva números, espacios y los signos + ( ) -.' }),
    ),
    preferredChannel: z.enum(['EMAIL', 'PHONE'] as const),
    subject: z
      .string()
      .trim()
      .min(3, { error: () => 'Escribe un asunto, aunque sea corto.' })
      .max(200),
    narrative: z
      .string()
      .trim()
      .min(20, {
        error: () => 'Cuéntanos un poco más para poder ayudarte: al menos veinte caracteres.',
      })
      .max(8000, { error: () => 'El mensaje es muy largo. Resume lo esencial y lo demás lo vemos contigo.' }),
    territoryHint: opcional(z.string().max(160)),
    acceptedPrivacyNotice: z.literal(true, {
      error: () => 'Necesitamos que aceptes el aviso de privacidad para poder guardar tu mensaje.',
    }),
  })
  .refine((valor) => valor.contactEmail !== undefined || valor.contactPhone !== undefined, {
    error: () => 'Déjanos al menos un medio para contestarte: un correo o un teléfono.',
    path: ['contactEmail'],
  })
  .refine((valor) => valor.preferredChannel !== 'EMAIL' || valor.contactEmail !== undefined, {
    error: () => 'Pediste que te contestemos por correo, así que necesitamos tu correo.',
    path: ['contactEmail'],
  })
  .refine((valor) => valor.preferredChannel !== 'PHONE' || valor.contactPhone !== undefined, {
    error: () => 'Pediste que te contestemos por teléfono, así que necesitamos tu teléfono.',
    path: ['contactPhone'],
  });

export type SubmitRequestInput = z.input<typeof submitRequestSchema>;

export interface IntakeContext {
  readonly correlationId: string;
  /** Hash del origen que calcula `requestContext()`. Nunca la dirección. */
  readonly ipHash: string | null;
}

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Folio legible. Sin letras que se confundan al dictarlo por teléfono.
 *
 * No lleva contador: un folio correlativo diría cuántos mensajes recibe la
 * organización a quien tenga dos folios, y eso es información interna.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function nuevoFolio(prefijo: string, ahora: Date): string {
  const bytes = randomBytes(8);
  let cuerpo = '';
  for (const byte of bytes) cuerpo += ALFABETO[byte % ALFABETO.length];
  return `${prefijo}-${ahora.getUTCFullYear()}-${cuerpo}`;
}

/** Cuenta los envíos logrados de este origen en la ventana vigente. */
async function envíosRecientes(originFingerprint: string): Promise<number> {
  return db().supportRequest.count({
    where: {
      originFingerprint,
      receivedAt: { gte: new Date(Date.now() - INTAKE_RATE_LIMIT.windowMs) },
    },
  });
}

export async function submitRequest(
  input: SubmitRequestInput,
  context: IntakeContext,
): Promise<UseCaseResult<{ folio: string }>> {
  const parsed = submitRequestSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  // Un origen desconocido se agrupa con los demás desconocidos: es un cubo
  // acotado y separado, no un comodín que se lleve por delante a todo el mundo
  // (misma razón que en `checkRateLimit`).
  const originFingerprint = fingerprint(context.ipHash ?? 'origen-desconocido', env().AUTH_SECRET);

  if ((await envíosRecientes(originFingerprint)) >= INTAKE_RATE_LIMIT.maxSubmissions) {
    return fail(errors.rateLimited(Math.ceil(INTAKE_RATE_LIMIT.windowMs / 1000)));
  }

  const entidad = await db().legalEntity.findUnique({
    where: { code: data.legalEntity },
    select: { id: true, shortName: true, contactEmail: true, documentSeriesPrefix: true },
  });
  if (entidad === null) return fail(errors.notFound('entidad jurídica inexistente'));

  const aviso = await db().consentVersion.findFirst({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE, legalEntityId: entidad.id, status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
    select: { id: true, version: true },
  });
  if (aviso === null) {
    return fail(
      errors.ruleViolation(
        'Ahora mismo no podemos recibir tu mensaje por este formulario. Escríbenos directamente y te atendemos igual.',
        `no hay aviso de privacidad publicado (${PUBLIC_INTAKE_NOTICE_CODE}) para ${data.legalEntity}: recabar datos personales sin él incumpliría la ley`,
      ),
    );
  }

  const ahora = new Date();

  // Dos intentos: el folio es aleatorio y la colisión es remotísima, pero
  // «remotísima» no es «imposible» y el índice único la convertiría en un error
  // que ve quien escribe. Si el segundo también choca, algo más pasa.
  for (let intento = 0; intento < 2; intento += 1) {
    const folio = nuevoFolio(entidad.documentSeriesPrefix, ahora);

    try {
      await transaction(async (tx) => {
        await tx.supportRequest.create({
          data: {
            folio,
            requestType: data.requestType,
            legalEntityId: entidad.id,
            contactName: data.contactName,
            contactEmail: data.contactEmail ?? null,
            contactPhone: data.contactPhone ?? null,
            preferredChannel: data.preferredChannel,
            subject: data.subject,
            narrative: data.narrative,
            territoryHint: data.territoryHint ?? null,
            privacyNoticeVersionId: aviso.id,
            originFingerprint,
          },
          select: { id: true },
        });
      });

      // El acuse va fuera de la transacción a propósito: si el correo no sale,
      // el mensaje ya está guardado y alguien lo va a leer igual. Al revés
      // —perder el mensaje porque el proveedor de correo falló— sería perder lo
      // único que importa.
      if (data.contactEmail !== undefined) {
        try {
          await enqueue({
            jobType: 'support-request-acknowledge',
            businessKey: folio,
            payload: {
              to: data.contactEmail,
              templateCode: 'SUPPORT_REQUEST_ACK',
              variables: {
                contactName: data.contactName,
                folio,
                entityName: entidad.shortName,
                contactEmail: entidad.contactEmail,
              },
            },
            correlationId: context.correlationId,
          });
        } catch (error) {
          logger.error('No se pudo encolar el acuse de la entrada pública', {
            module: 'support',
            correlationId: context.correlationId,
            outcome: 'failed',
            context: { folio, error },
          });
        }
      }

      return ok({ folio });
    } catch (error) {
      const esColisionDeFolio =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002';
      if (!esColisionDeFolio || intento === 1) throw error;
    }
  }

  // Inalcanzable: el bucle devuelve o relanza. Está por exhaustividad del tipo.
  throw new Error('No se pudo asignar folio a la entrada pública.');
}
