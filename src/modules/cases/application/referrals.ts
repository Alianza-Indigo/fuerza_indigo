import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain, type Resource } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { compartimentoDeExpediente } from '@/platform/authz/compartments';
import type { CaseDomain, Compartment, ReferralStatus, ReferralTarget } from '@prisma-client/enums';
import { CAMPOS_TRANSFERIBLES, type CampoTransferible } from '../domain/referral';
import { CAMPOS_PARA_DECIDIR, estaAsignada, recursoDelExpediente } from './assignment';

/**
 * Canalización entre Fuerza Índigo, Alianza Índigo y terceros (PRD §10.4).
 *
 * Los seis requisitos del PRD no son una guía de uso: son los estados por los
 * que pasa esta tabla y las condiciones que cada paso comprueba.
 *
 *  1. **Explicación comprensible.** Se escribe al proponer y se le enseña a la
 *     persona antes de pedirle el sí. Un consentimiento sin explicación previa
 *     no es informado; es una casilla.
 *  2. **Consentimiento específico.** No basta un «sí» genérico para
 *     canalizaciones: el consentimiento tiene que **nombrar esta canalización**
 *     y cubrir exactamente los campos y archivos que se listaron. Uno general
 *     serviría para cualquier transferencia futura, que es justo lo que la
 *     palabra «específico» excluye.
 *  3. **Selección de datos y documentos.** Lista blanca. Las notas reservadas y
 *     las comunicaciones internas no están entre lo elegible, así que no viajan
 *     ni por descuido.
 *  4. **Aceptación del área receptora.** La acepta alguien de la entidad que
 *     recibe, no quien envía. Enviar y aceptarse a sí misma sería mandarse un
 *     expediente por correo.
 *  5. **Seguimiento sin exponer notas reservadas.** Quien envía ve en qué
 *     estado va; lo que no viajó, no se ve.
 *  6. **Cierre o devolución con motivo.** Nada se descarta en silencio, y la
 *     base lo impone: una devolución sin motivo no se puede escribir.
 */

const CAMPOS = Object.keys(CAMPOS_TRANSFERIBLES) as [CampoTransferible, ...CampoTransferible[]];

export const proposeReferralSchema = z
  .object({
    caseId: z.uuid(),
    toModule: z.enum(['UNION_DEFENSE', 'SOCIAL_ATTENTION', 'EXTERNAL'] as const satisfies readonly ReferralTarget[]),
    /** Entidad que recibe. Para una canalización externa, la que la coordina. */
    toLegalEntityId: z.uuid({ error: () => 'Elige a qué entidad se canaliza.' }),
    /** Nombre de la institución de fuera. Solo para las externas. */
    externalRecipient: z.string().trim().min(3).max(200).nullable().default(null),
    reason: z.string().trim().min(20, {
      error: () => 'Escribe por qué se canaliza: al menos veinte caracteres.',
    }),
    explanationShownToPerson: z.string().trim().min(30, {
      error: () =>
        'Escribe lo que se le va a explicar a la persona, en sus términos: es lo que leerá antes de decidir.',
    }),
    sharedFields: z.array(z.enum(CAMPOS)).min(1, {
      error: () => 'Elige qué se transfiere. Una canalización que no lleva nada no sirve de nada.',
    }),
    sharedFileIds: z.array(z.uuid()).default([]),
  })
  .refine((valor) => (valor.toModule === 'EXTERNAL') === (valor.externalRecipient !== null), {
    error: () =>
      'Una canalización externa nombra a quien la recibe; una interna no lo lleva. Sin eso quedaría enviada a nadie.',
    path: ['externalRecipient'],
  });

export type ProposeReferralInput = z.input<typeof proposeReferralSchema>;

export const referralActionSchema = z.object({ referralId: z.uuid() });

export const sendReferralSchema = z.object({
  referralId: z.uuid(),
  /** El sí de la persona. Tiene que nombrar esta canalización. */
  consentId: z.uuid({ error: () => 'Sin el consentimiento de la persona no se envía.' }),
});

export type SendReferralInput = z.infer<typeof sendReferralSchema>;

export const acceptReferralSchema = z.object({
  referralId: z.uuid(),
  /**
   * Por qué el área receptora se hace cargo.
   *
   * Aceptar es asumir un asunto ajeno, y la facultad lo pide. El motivo no va
   * a la fila —no hay columna para él— pero sí a la bitácora de auditoría, que
   * es donde se busca cuando alguien pregunta por qué acabó aquí.
   */
  note: z.string().trim().min(10, {
    error: () => 'Escribe por qué se hace cargo el área receptora: al menos diez caracteres.',
  }),
  /** Expediente que abre quien recibe, cuando ya lo abrió. */
  targetCaseId: z.uuid().nullable().default(null),
});

export type AcceptReferralInput = z.input<typeof acceptReferralSchema>;

export const returnReferralSchema = z.object({
  referralId: z.uuid(),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué se devuelve. Nada se descarta en silencio.',
  }),
});

export type ReturnReferralInput = z.infer<typeof returnReferralSchema>;

export const closeReferralSchema = z.object({ referralId: z.uuid() });

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Quién es la persona del expediente, para pedirle el consentimiento.
 *
 * Es quien pidió la ayuda; si no está identificada, quien sufre los hechos. Sin
 * ninguna de las dos no hay a quién preguntarle, y una canalización sin
 * consentimiento no es una canalización: es una transferencia.
 */
async function personaDelExpediente(caseId: string): Promise<string | null> {
  const participantes = await db().caseParticipant.findMany({
    where: { caseId, removedAt: null, personId: { not: null }, role: { in: ['APPLICANT', 'AFFECTED_PERSON'] } },
    select: { personId: true, role: true },
  });
  const solicitante = participantes.find((participante) => participante.role === 'APPLICANT');
  return (solicitante ?? participantes[0])?.personId ?? null;
}

/** Lee el alcance de un consentimiento sin fiarse de su forma: es una columna `Json`. */
function alcanceDe(valor: unknown): { referralId: string | null; fields: string[]; files: string[] } {
  if (typeof valor !== 'object' || valor === null) return { referralId: null, fields: [], files: [] };
  const bruto = valor as Record<string, unknown>;
  const referralId = typeof bruto['referralId'] === 'string' ? bruto['referralId'] : null;
  const fields = Array.isArray(bruto['fields'])
    ? bruto['fields'].filter((entrada): entrada is string => typeof entrada === 'string')
    : [];
  const files = Array.isArray(bruto['files'])
    ? bruto['files'].filter((entrada): entrada is string => typeof entrada === 'string')
    : [];
  return { referralId, fields, files };
}

/**
 * La canalización como recurso, con el territorio del expediente de origen.
 *
 * El asunto sigue ocurriendo donde ocurría: quien recibe no puede hacerse cargo
 * de un expediente que su nombramiento no alcanza, aunque la entidad receptora
 * sea la suya. Sin el territorio, el motor no lo comprobaría, y una
 * comprobación que falta no falla: permite.
 */
function recursoDeLaCanalizacion(
  canalizacion: {
    id: string;
    toLegalEntityId: string;
    case: { territorialUnit: { path: string } | null };
  },
  compartimento: Compartment | null,
): Resource {
  return {
    kind: 'Referral',
    id: canalizacion.id,
    legalEntityId: canalizacion.toLegalEntityId,
    territorialPath: canalizacion.case.territorialUnit?.path ?? null,
    compartment: compartimento,
  };
}

/** Dos conjuntos con los mismos elementos, sin importar el orden. */
function mismosElementos(una: readonly string[], otra: readonly string[]): boolean {
  const primera = new Set(una);
  const segunda = new Set(otra);
  return primera.size === segunda.size && [...primera].every((elemento) => segunda.has(elemento));
}

/**
 * El expediente y la facultad de canalizarlo, con el motivo que esa facultad
 * exige.
 *
 * El motivo no es decorativo: `cases.referral.propose` lo pide, y sin él el
 * motor niega. Los pasos posteriores —pedir el consentimiento, enviar, cerrar—
 * lo heredan del propio motivo de la canalización, que es exactamente por qué
 * se están dando: no son actos con una razón distinta de la que los originó.
 */
async function puedeCanalizar(
  actor: ActorContext,
  caseId: string,
  motivo: string,
): Promise<UseCaseResult<{ id: string; folio: string; legalEntityId: string; domain: CaseDomain; status: string }>> {
  const expediente = await db().case.findUnique({
    where: { id: caseId },
    select: { ...CAMPOS_PARA_DECIDIR, folio: true, status: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));

  const asignada = await estaAsignada(actor, expediente.id);
  const decision = can(
    { ...actor, reason: motivo },
    'cases.referral.propose',
    recursoDelExpediente(expediente),
    { hasLiveAssignment: () => asignada },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  return ok({
    id: expediente.id,
    folio: expediente.folio,
    legalEntityId: expediente.legalEntityId,
    domain: expediente.domain,
    status: expediente.status,
  });
}

export async function proposeReferral(
  actor: ActorContext,
  input: ProposeReferralInput,
): Promise<UseCaseResult<{ referralId: string; personId: string }>> {
  const parsed = proposeReferralSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const permiso = await puedeCanalizar(actor, data.caseId, data.reason);
  if (!permiso.ok) return permiso;
  const expediente = permiso.data;

  if (expediente.status === 'CLOSED') {
    return fail(errors.conflict('Ese expediente está cerrado. Reábrelo antes de canalizarlo a ningún sitio.'));
  }

  const personId = await personaDelExpediente(expediente.id);
  if (personId === null) {
    return fail(
      errors.ruleViolation(
        'Este expediente no tiene identificada a la persona a la que atañe, y una canalización necesita su consentimiento. Agrégala como participante antes de canalizar.',
      ),
    );
  }

  const destino = await db().legalEntity.findUnique({
    where: { id: data.toLegalEntityId },
    select: { id: true },
  });
  if (destino === null) return fail(errors.notFound('Esa entidad no existe.'));

  if (data.toModule !== 'EXTERNAL' && destino.id === expediente.legalEntityId) {
    return fail(
      errors.ruleViolation(
        'Ese expediente ya es de esa entidad. Canalizar dentro de la misma persona moral es reasignarlo: cámbiale el equipo.',
      ),
    );
  }

  // Los archivos que se listan tienen que estar **en este expediente** y no
  // retirados. Aceptar un identificador suelto permitiría transferir el
  // documento de otro caso adjuntándolo a esta canalización.
  if (data.sharedFileIds.length > 0) {
    const documentos = await db().caseDocument.findMany({
      where: { caseId: expediente.id, removedAt: null, fileObjectId: { in: data.sharedFileIds } },
      select: { fileObjectId: true },
    });
    if (documentos.length !== new Set(data.sharedFileIds).size) {
      return fail(
        errors.ruleViolation(
          'Alguno de los archivos que se quieren transferir no figura en este expediente. Solo viaja lo que está en él.',
        ),
      );
    }
  }

  const propuesta = await transaction(async (tx) => {
    const fila = await tx.referral.create({
      data: {
        caseId: expediente.id,
        fromLegalEntityId: expediente.legalEntityId,
        toLegalEntityId: destino.id,
        toModule: data.toModule,
        externalRecipient: data.externalRecipient,
        reason: data.reason,
        explanationShownToPerson: data.explanationShownToPerson,
        sharedFields: data.sharedFields,
        status: 'PROPOSED',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.caseEvent.create({
      data: {
        caseId: expediente.id,
        kind: 'REFERRAL_CREATED',
        actorId: actor.actorId,
        summary: `Se propone canalizar el expediente${data.externalRecipient === null ? '' : ` a ${data.externalRecipient}`}.`,
        payload: { canalizacion: fila.id, campos: data.sharedFields, archivos: data.sharedFileIds.length },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_REFERRAL_PROPOSED,
      objectKind: 'Referral',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      metadata: {
        folio: expediente.folio,
        destino: data.toModule,
        campos: data.sharedFields,
        archivos: data.sharedFileIds.length,
      },
    });

    return fila;
  });

  return ok({ referralId: propuesta.id, personId });
}

/**
 * Deja constancia de que se le explicó a la persona y se le pidió el sí.
 *
 * Es un paso propio y no un detalle de la propuesta porque el requisito 1 del
 * PRD es que la explicación vaya **antes** del consentimiento. Si la explicación
 * y el sí se registraran en el mismo acto, no habría forma de distinguir un
 * consentimiento informado de uno recogido a la vez que se redactaba lo que se
 * le iba a contar.
 */
export async function requestReferralConsent(
  actor: ActorContext,
  input: z.infer<typeof referralActionSchema>,
): Promise<UseCaseResult<{ referralId: string; explicacion: string; personId: string }>> {
  const parsed = referralActionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const canalizacion = await db().referral.findUnique({
    where: { id: parsed.data.referralId },
    select: { id: true, status: true, caseId: true, reason: true, explanationShownToPerson: true },
  });
  if (canalizacion === null) return fail(errors.notFound('Esa canalización no existe.'));

  const permiso = await puedeCanalizar(actor, canalizacion.caseId, canalizacion.reason);
  if (!permiso.ok) return permiso;
  const expediente = permiso.data;

  if (canalizacion.status !== 'PROPOSED') {
    return fail(errors.conflict('Esa canalización ya pasó de la propuesta.'));
  }

  const personId = await personaDelExpediente(canalizacion.caseId);
  if (personId === null) {
    return fail(errors.ruleViolation('Este expediente no tiene identificada a la persona a la que atañe.'));
  }

  await transaction(async (tx) => {
    await tx.referral.update({
      where: { id: canalizacion.id },
      data: { status: 'AWAITING_CONSENT', updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_REFERRAL_CONSENT_REQUESTED,
      objectKind: 'Referral',
      objectId: canalizacion.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      metadata: { folio: expediente.folio, persona: personId },
    });
  });

  return ok({
    referralId: canalizacion.id,
    explicacion: canalizacion.explanationShownToPerson,
    personId,
  });
}

export async function sendReferral(
  actor: ActorContext,
  input: SendReferralInput,
): Promise<UseCaseResult<{ referralId: string }>> {
  const parsed = sendReferralSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const canalizacion = await db().referral.findUnique({
    where: { id: data.referralId },
    select: { id: true, status: true, caseId: true, reason: true, sharedFields: true, toLegalEntityId: true },
  });
  if (canalizacion === null) return fail(errors.notFound('Esa canalización no existe.'));

  const permiso = await puedeCanalizar(actor, canalizacion.caseId, canalizacion.reason);
  if (!permiso.ok) return permiso;
  const expediente = permiso.data;

  if (canalizacion.status !== 'AWAITING_CONSENT') {
    return fail(
      errors.conflict(
        'Antes de enviarla hay que explicarle a la persona qué se transfiere y pedirle el consentimiento.',
      ),
    );
  }

  const personId = await personaDelExpediente(canalizacion.caseId);
  if (personId === null) {
    return fail(errors.ruleViolation('Este expediente no tiene identificada a la persona a la que atañe.'));
  }

  const consentimiento = await db().consent.findUnique({
    where: { id: data.consentId },
    select: { id: true, personId: true, purpose: true, scope: true, revokedAt: true, expiresAt: true },
  });
  if (consentimiento === null) return fail(errors.notFound('Ese consentimiento no existe.'));

  if (consentimiento.personId !== personId) {
    return fail(
      errors.ruleViolation('Ese consentimiento no es de la persona de este expediente. El sí de otra no vale aquí.'),
    );
  }
  if (consentimiento.purpose !== 'INTER_ENTITY_REFERRAL') {
    return fail(
      errors.ruleViolation(
        'Ese consentimiento se dio para otra cosa. Ningún consentimiento genérico sustituye al específico para canalizar.',
      ),
    );
  }
  const ahora = new Date();
  if (consentimiento.revokedAt !== null || (consentimiento.expiresAt !== null && consentimiento.expiresAt <= ahora)) {
    return fail(errors.ruleViolation('Ese consentimiento ya no está vigente. Pídelo otra vez antes de enviar.'));
  }

  // **Específico** quiere decir: nombra esta canalización y cubre exactamente
  // lo que se listó. Uno que cubriera de más serviría para transferencias que
  // la persona no ha visto; uno que cubriera de menos transferiría lo que no
  // autorizó.
  const alcance = alcanceDe(consentimiento.scope);
  if (alcance.referralId !== canalizacion.id) {
    return fail(
      errors.ruleViolation(
        'Ese consentimiento no nombra esta canalización. Uno general valdría para cualquier transferencia futura, que es justo lo que «específico» excluye.',
      ),
    );
  }
  if (!mismosElementos(alcance.fields, canalizacion.sharedFields)) {
    return fail(
      errors.ruleViolation(
        'Lo que se consintió no coincide con lo que se va a transferir. Vuelve a pedir el consentimiento sobre la selección de ahora.',
      ),
    );
  }

  // Los archivos que amparaba el consentimiento tienen que seguir en el
  // expediente: uno retirado entre el sí y el envío ya no viaja.
  const documentos =
    alcance.files.length === 0
      ? []
      : await db().caseDocument.findMany({
          where: { caseId: canalizacion.caseId, removedAt: null, fileObjectId: { in: alcance.files } },
          select: { fileObjectId: true },
        });
  if (documentos.length !== new Set(alcance.files).size) {
    return fail(
      errors.ruleViolation(
        'Alguno de los archivos que se consintieron ya no figura en el expediente. Vuelve a pedir el consentimiento sobre lo que hay.',
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.referral.update({
      where: { id: canalizacion.id },
      data: {
        status: 'SENT',
        consentId: consentimiento.id,
        sentAt: ahora,
        updatedByActorId: actor.actorId,
      },
    });

    // Cada archivo transferido lleva **su** consentimiento: es el dato que no
    // cabe en una lista de identificadores (docs/DATA_MODEL.md §11).
    for (const documento of documentos) {
      await tx.referralSharedFile.create({
        data: {
          referralId: canalizacion.id,
          fileObjectId: documento.fileObjectId,
          consentId: consentimiento.id,
        },
      });
    }

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_REFERRAL_SENT,
      objectKind: 'Referral',
      objectId: canalizacion.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      metadata: {
        folio: expediente.folio,
        consentimiento: consentimiento.id,
        campos: canalizacion.sharedFields,
        archivos: documentos.length,
      },
    });
  });

  return ok({ referralId: canalizacion.id });
}

export async function acceptReferral(
  actor: ActorContext,
  input: AcceptReferralInput,
): Promise<UseCaseResult<{ referralId: string }>> {
  const parsed = acceptReferralSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const canalizacion = await db().referral.findUnique({
    where: { id: data.referralId },
    select: {
      id: true,
      status: true,
      caseId: true,
      toModule: true,
      toLegalEntityId: true,
      case: { select: { folio: true, territorialUnit: { select: { path: true } } } },
    },
  });
  if (canalizacion === null) return fail(errors.notFound('Esa canalización no existe.'));
  if (canalizacion.status !== 'SENT') {
    return fail(errors.conflict('Esa canalización no está enviada: no hay nada que aceptar todavía.'));
  }

  // La acepta **quien recibe**, en su entidad y su compartimento. Que la
  // aceptara quien envía sería mandarse un expediente por correo.
  const compartimento =
    canalizacion.toModule === 'EXTERNAL'
      ? null
      : compartimentoDeExpediente(canalizacion.toModule satisfies CaseDomain);
  const contexto = { ...actor, reason: data.note };
  const decision = can(contexto, 'cases.referral.accept', recursoDeLaCanalizacion(canalizacion, compartimento));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienAcepta = actor.userId;
  if (quienAcepta === null || quienAcepta === undefined) {
    return fail(errors.forbidden('Aceptar una canalización es un acto de una persona: exige una cuenta.'));
  }

  if (data.targetCaseId !== null) {
    const destino = await db().case.findUnique({
      where: { id: data.targetCaseId },
      select: { legalEntityId: true },
    });
    if (destino === null) return fail(errors.notFound('Ese expediente de destino no existe.'));
    if (destino.legalEntityId !== canalizacion.toLegalEntityId) {
      return fail(errors.ruleViolation('Ese expediente no es de la entidad que recibe la canalización.'));
    }
  }

  await transaction(async (tx) => {
    await tx.referral.update({
      where: { id: canalizacion.id },
      data: {
        status: 'ACCEPTED',
        acceptedById: quienAcepta,
        acceptedAt: new Date(),
        targetCaseId: data.targetCaseId,
        updatedByActorId: actor.actorId,
      },
    });

    await tx.caseEvent.create({
      data: {
        caseId: canalizacion.caseId,
        kind: 'REFERRAL_ACCEPTED',
        actorId: actor.actorId,
        summary: 'El área receptora aceptó la canalización.',
        payload: { canalizacion: canalizacion.id, expedienteDestino: data.targetCaseId },
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_REFERRAL_ACCEPTED,
      objectKind: 'Referral',
      objectId: canalizacion.id,
      outcome: 'SUCCESS',
      legalEntityId: canalizacion.toLegalEntityId,
      reason: data.note,
      metadata: { folio: canalizacion.case.folio, expedienteDestino: data.targetCaseId },
    });
  });

  return ok({ referralId: canalizacion.id });
}

/**
 * Devuelve o rechaza una canalización, siempre con motivo.
 *
 * Rechazar y devolver son el mismo acto en dos momentos: antes de aceptarla o
 * después. Se distinguen en el estado porque no significan lo mismo para quien
 * envió —una no llegó a entrar, la otra entró y se sale—, y la base exige el
 * motivo en las dos.
 */
export async function returnReferral(
  actor: ActorContext,
  input: ReturnReferralInput,
): Promise<UseCaseResult<{ referralId: string; status: ReferralStatus }>> {
  const parsed = returnReferralSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const canalizacion = await db().referral.findUnique({
    where: { id: data.referralId },
    select: {
      id: true,
      status: true,
      caseId: true,
      toModule: true,
      toLegalEntityId: true,
      case: { select: { folio: true, territorialUnit: { select: { path: true } } } },
    },
  });
  if (canalizacion === null) return fail(errors.notFound('Esa canalización no existe.'));
  if (canalizacion.status !== 'SENT' && canalizacion.status !== 'ACCEPTED') {
    return fail(errors.conflict('Esa canalización no está en manos del área receptora.'));
  }

  const compartimento =
    canalizacion.toModule === 'EXTERNAL'
      ? null
      : compartimentoDeExpediente(canalizacion.toModule satisfies CaseDomain);
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'cases.referral.accept', recursoDeLaCanalizacion(canalizacion, compartimento));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const destino: ReferralStatus = canalizacion.status === 'SENT' ? 'REJECTED' : 'RETURNED';

  await transaction(async (tx) => {
    await tx.referral.update({
      where: { id: canalizacion.id },
      data: {
        status: destino,
        returnReason: data.reason,
        closedAt: new Date(),
        updatedByActorId: actor.actorId,
      },
    });

    await tx.caseEvent.create({
      data: {
        caseId: canalizacion.caseId,
        kind: 'REFERRAL_RETURNED',
        actorId: actor.actorId,
        summary:
          destino === 'REJECTED'
            ? 'El área receptora no admitió la canalización, y dijo por qué.'
            : 'El área receptora devolvió el asunto, y dijo por qué.',
        payload: { canalizacion: canalizacion.id, motivo: data.reason },
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_REFERRAL_RETURNED,
      objectKind: 'Referral',
      objectId: canalizacion.id,
      outcome: 'SUCCESS',
      legalEntityId: canalizacion.toLegalEntityId,
      reason: data.reason,
      metadata: { folio: canalizacion.case.folio, estado: destino },
    });
  });

  return ok({ referralId: canalizacion.id, status: destino });
}

/** Cierra una canalización aceptada: el área receptora terminó lo suyo. */
export async function closeReferral(
  actor: ActorContext,
  input: z.infer<typeof closeReferralSchema>,
): Promise<UseCaseResult<{ referralId: string }>> {
  const parsed = closeReferralSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const canalizacion = await db().referral.findUnique({
    where: { id: parsed.data.referralId },
    select: {
      id: true,
      status: true,
      caseId: true,
      reason: true,
      toLegalEntityId: true,
      case: { select: { folio: true } },
    },
  });
  if (canalizacion === null) return fail(errors.notFound('Esa canalización no existe.'));
  if (canalizacion.status !== 'ACCEPTED') {
    return fail(errors.conflict('Solo se cierra una canalización que el área receptora aceptó.'));
  }

  const permiso = await puedeCanalizar(actor, canalizacion.caseId, canalizacion.reason);
  if (!permiso.ok) return permiso;

  await transaction(async (tx) => {
    await tx.referral.update({
      where: { id: canalizacion.id },
      data: { status: 'CLOSED', closedAt: new Date(), updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_REFERRAL_CLOSED,
      objectKind: 'Referral',
      objectId: canalizacion.id,
      outcome: 'SUCCESS',
      legalEntityId: permiso.data.legalEntityId,
      metadata: { folio: canalizacion.case.folio },
    });
  });

  return ok({ referralId: canalizacion.id });
}
