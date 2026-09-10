import { z } from 'zod';

import { submitRequest, type IntakeContext } from '@/modules/support';
import { errors } from '@/platform/errors/app-error';
import type { UseCaseResult } from '@/platform/kernel/result';

/**
 * Solicitud inicial de registro desde el sitio público.
 *
 * La afiliación formal sigue viviendo en `MembershipApplication`: requiere una
 * cuenta, aceptación estatutaria y revisión humana. Esta entrada no pretende
 * sustituir ese expediente. Abre un folio trazable para que la Secretaría
 * verifique el contacto, invite a la persona y le permita continuar el trámite
 * sin recabar aquí documentos clínicos. La CURP se solicita por instrucción
 * institucional para identificar el expediente y queda bajo el aviso de
 * privacidad de la entrada pública.
 */

export const PUBLIC_MEMBERSHIP_MODALITIES = [
  'UNION_MEMBER',
  'HONORARY_AFFILIATE',
  'PROTECTED_BENEFICIARY',
] as const;
export const PUBLIC_MEMBERSHIP_INTAKE_NOTICE_CODE = 'PRIVACY_NOTICE_MEMBERSHIP_INTAKE';

function optionalText<T extends z.ZodType<string, string>>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );
}

export const publicMembershipRequestSchema = z
  .object({
    modality: z.enum(PUBLIC_MEMBERSHIP_MODALITIES, {
      error: () => 'Elige una categoría de registro.',
    }),
    givenName: z.string().trim().min(1, { error: () => 'Escribe tu nombre.' }).max(80),
    familyName: z.string().trim().min(1, { error: () => 'Escribe tu primer apellido.' }).max(80),
    secondFamilyName: optionalText(z.string().trim().max(80)),
    curp: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][AEIOU][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:[0-2]\d|3[01])[HM](?:AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/, {
        error: () => 'Revisa la CURP: debe tener los 18 caracteres del documento oficial.',
      }),
    email: z.string().trim().toLowerCase().pipe(z.email({ error: () => 'Escribe un correo electrónico válido.' }).max(254)),
    phone: optionalText(
      z
        .string()
        .trim()
        .max(30)
        .regex(/^[0-9+()\s-]{7,30}$/, {
          error: () => 'El teléfono sólo lleva números, espacios y los signos + ( ) -.',
        }),
    ),
    territory: z.string().trim().min(2, { error: () => 'Escribe el estado o municipio desde donde haces tu solicitud.' }).max(160),
    occupation: z.string().trim().min(2, { error: () => 'Escribe tu ocupación actual.' }).max(160),
    workRelation: optionalText(z.enum(['SUBORDINATE', 'INDEPENDENT'])),
    neurodivergentConnection: optionalText(
      z
        .string()
        .trim()
        .min(30, { error: () => 'Cuéntanos un poco más: con treinta caracteres basta para empezar.' })
        .max(2000),
    ),
    protectedProfile: optionalText(z.enum(['NEURODIVERGENT_PERSON', 'FAMILY_MEMBER', 'CAREGIVER'])),
    context: optionalText(z.string().trim().max(2000)),
    ageConfirmed: z.boolean(),
    acceptedPrivacyNotice: z.literal(true, {
      error: () => 'Necesitamos que aceptes el aviso de privacidad para recibir tu solicitud.',
    }),
  })
  .superRefine((value, refinement) => {
    if (value.modality === 'UNION_MEMBER') {
      if (!value.ageConfirmed) {
        refinement.addIssue({
          code: 'custom',
          path: ['ageConfirmed'],
          message: 'Para solicitar afiliación sindical debes confirmar que tienes 15 años o más.',
        });
      }
      if (value.workRelation === undefined) {
        refinement.addIssue({ code: 'custom', path: ['workRelation'], message: 'Elige cómo realizas tu trabajo.' });
      }
      if (value.neurodivergentConnection === undefined) {
        refinement.addIssue({
          code: 'custom',
          path: ['neurodivergentConnection'],
          message: 'Cuéntanos qué tipo de contacto tienes con personas neurodivergentes en tu trabajo.',
        });
      }
    }

    if (value.modality === 'HONORARY_AFFILIATE' && value.neurodivergentConnection === undefined) {
      refinement.addIssue({
        code: 'custom',
        path: ['neurodivergentConnection'],
        message: 'Cuéntanos qué tipo de contacto tienes con personas neurodivergentes.',
      });
    }

    if (value.modality === 'PROTECTED_BENEFICIARY' && value.protectedProfile === undefined) {
      refinement.addIssue({
        code: 'custom',
        path: ['protectedProfile'],
        message: 'Elige el perfil desde el que solicitas tu registro como beneficiario protegido.',
      });
    }
  });

export type PublicMembershipRequestInput = z.input<typeof publicMembershipRequestSchema>;

const WORK_RELATION_LABELS = {
  SUBORDINATE: 'Trabajo subordinado',
  INDEPENDENT: 'Trabajo independiente',
} as const;

const PROTECTED_PROFILE_LABELS = {
  NEURODIVERGENT_PERSON: 'Persona neurodivergente',
  FAMILY_MEMBER: 'Familiar de una persona neurodivergente',
  CAREGIVER: 'Persona cuidadora',
} as const;

function validationDetails(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return details;
}

function requestNarrative(data: z.output<typeof publicMembershipRequestSchema>): string {
  if (data.modality === 'UNION_MEMBER') {
    return [
      'MODALIDAD: PERSONA AGREMIADA',
      `CURP: ${data.curp}`,
      `OCUPACIÓN: ${data.occupation}`,
      `FORMA DE TRABAJO: ${data.workRelation === undefined ? '' : WORK_RELATION_LABELS[data.workRelation]}`,
      'VÍNCULO CON LA COMUNIDAD NEURODIVERGENTE:',
      data.neurodivergentConnection ?? '',
      'CONFIRMACIÓN DE EDAD: La persona declaró tener 15 años o más.',
      'SIGUIENTE PASO: Verificar contacto, invitar como solicitante y continuar el expediente formal en el portal.',
    ].join('\n\n');
  }

  if (data.modality === 'HONORARY_AFFILIATE') {
    return [
      'CATEGORÍA: AGREMIADO HONORARIO',
      `CURP: ${data.curp}`,
      `OCUPACIÓN: ${data.occupation}`,
      'CONTACTO CON PERSONAS NEURODIVERGENTES:',
      data.neurodivergentConnection ?? '',
      ...(data.context === undefined ? [] : ['FORMA DE COLABORACIÓN:', data.context]),
      'SIGUIENTE PASO: Verificar el contacto y revisar manualmente la solicitud de registro.',
    ].join('\n\n');
  }

  return [
    'CATEGORÍA: BENEFICIARIO PROTEGIDO',
    `CURP: ${data.curp}`,
    `OCUPACIÓN: ${data.occupation}`,
    `PERFIL: ${data.protectedProfile === undefined ? '' : PROTECTED_PROFILE_LABELS[data.protectedProfile]}`,
    ...(data.context === undefined ? [] : ['AYUDA O PROTECCIÓN SOLICITADA:', data.context]),
    'CONDICIONES: Sin voz, sin voto y sin pago de cuota.',
    'SIGUIENTE PASO: Verificar el contacto y revisar manualmente la solicitud de registro.',
  ].join('\n\n');
}

export async function submitPublicMembershipRequest(
  input: PublicMembershipRequestInput,
  context: IntakeContext,
): Promise<UseCaseResult<{ folio: string }>> {
  const parsed = publicMembershipRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: errors.validation(validationDetails(parsed.error)) };
  }

  const data = parsed.data;
  const contactName = [data.givenName, data.familyName, data.secondFamilyName].filter(Boolean).join(' ');

  return submitRequest(
    {
      requestType: 'GENERAL_CONTACT',
      legalEntity: 'FUERZA_INDIGO',
      contactName,
      contactEmail: data.email,
      ...(data.phone === undefined ? {} : { contactPhone: data.phone }),
      preferredChannel: 'EMAIL',
      subject:
        data.modality === 'UNION_MEMBER'
          ? 'Solicitud inicial de registro como agremiado'
          : data.modality === 'HONORARY_AFFILIATE'
            ? 'Solicitud inicial de registro como agremiado honorario'
            : 'Solicitud inicial de registro como beneficiario protegido',
      narrative: requestNarrative(data),
      territoryHint: data.territory,
      acceptedPrivacyNotice: true,
    },
    context,
    { privacyNoticeCode: PUBLIC_MEMBERSHIP_INTAKE_NOTICE_CODE },
  );
}
