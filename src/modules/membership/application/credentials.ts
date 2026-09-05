import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { logger } from '@/platform/observability/logger';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { leerToken, nuevoCodigoFirmado, tokenDe } from '@/platform/credentials/signing';
import type {
  CredentialKind,
  CredentialVerificationResult,
  MemberCredentialStatus,
  MembershipStatus,
  UserAgentClass,
} from '@prisma-client/enums';

/**
 * Credenciales con QR, verificador público y revocación
 * (PRD §7.4, §8.1 paso 13; F4-CRE-001 a F4-CRE-004).
 *
 * **Una credencial no tiene vida propia: acredita una membresía.** De ahí sale
 * casi todo lo demás. Su estado guardado solo recoge lo que le pasa *a ella*
 * —que se revoque porque se perdió, que se reponga— y el resto se deriva en el
 * momento de leerla: si la membresía está suspendida, la credencial dice
 * «suspendida»; si se acabó su vigencia, dice «vencida». Nada de eso espera a
 * que un trabajo nocturno pase a marcarlo.
 *
 * **Por qué derivar y no guardar.** El PRD §24 Fase 4 exige que «una credencial
 * revocada se refleje inmediatamente en el verificador», y el §7.4 que el
 * verificador distinga vigencia, suspensión, vencimiento y revocación. Un
 * estado guardado por un trabajo abre una ventana —minutos u horas— en la que
 * la pantalla pública dice que vale algo que ya no vale. Esa ventana es
 * precisamente lo que no se puede tener: quien enseña una credencial en una
 * puerta la enseña ahora.
 *
 * **El QR no lleva datos personales** (`platform/credentials/signing`), y la
 * página de verificación enseña exactamente los siete datos que el PRD §7.4
 * enumera. Ni el número de miembro, ni el correo, ni el identificador interno.
 */

/* -------------------------------------------------------------------------- */
/* Estado vigente: lo que la credencial vale ahora mismo                      */
/* -------------------------------------------------------------------------- */

/** Estados de membresía en los que la persona sigue siendo miembro. */
const MEMBRESIA_VIVA: MembershipStatus[] = ['ACTIVE', 'SUSPENDED', 'DISCIPLINARY_PROCESS'];

/** Estados de membresía que suspenden lo que la credencial acredita. */
const MEMBRESIA_EN_PAUSA: MembershipStatus[] = ['SUSPENDED', 'DISCIPLINARY_PROCESS'];

export interface CredencialParaEstado {
  readonly status: MemberCredentialStatus;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly membership: { readonly status: MembershipStatus } | null;
}

/**
 * Qué vale la credencial en este instante.
 *
 * El orden importa y es el de la gravedad: revocada primero —es una decisión
 * tomada sobre este documento y no la levanta nada—, después repuesta, después
 * el calendario, y al final lo que le pase a la membresía que acredita.
 */
export function estadoVigente(credencial: CredencialParaEstado, ahora: Date = new Date()): MemberCredentialStatus {
  if (credencial.revokedAt !== null || credencial.status === 'REVOKED') return 'REVOKED';
  if (credencial.status === 'REPLACED') return 'REPLACED';
  if (credencial.expiresAt !== null && credencial.expiresAt <= ahora) return 'EXPIRED';

  const membresia = credencial.membership;
  if (membresia !== null) {
    if (MEMBRESIA_EN_PAUSA.includes(membresia.status)) return 'SUSPENDED';
    // La membresía terminó —baja, vencimiento, conversión— y con ella lo que la
    // credencial acreditaba. Se anuncia como vencida y no como revocada: nadie
    // revocó este documento, dejó de acreditar algo que ya no existe.
    if (!MEMBRESIA_VIVA.includes(membresia.status)) return 'EXPIRED';
  }

  return 'ACTIVE';
}

/* -------------------------------------------------------------------------- */
/* Emisión (F4-CRE-001)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Emite la credencial de una membresía recién activada.
 *
 * Se llama **dentro de la transacción que activa la membresía** (PRD §8.1 paso
 * 13: «se activa la membresía y se emite credencial»). Si se hiciera después,
 * en otro trabajo, existiría un rato en el que la persona es miembro y no puede
 * demostrarlo, que es justo cuando más falta le hace.
 *
 * No se exporta desde la interfaz del módulo: no es un acto que nadie ordene
 * desde una pantalla, es una consecuencia de activar.
 */
export async function emitirCredencialDeMembresia(
  tx: Tx,
  actor: ActorContext,
  membresia: {
    id: string;
    personId: string;
    legalEntityId: string;
    category: 'UNION_MEMBER' | 'HONORARY_AFFILIATE';
    expiresAt: Date | null;
    territorialUnitId: string | null;
  },
): Promise<{ credentialId: string; publicCode: string }> {
  const persona = await tx.person.findUniqueOrThrow({
    where: { id: membresia.personId },
    select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true },
  });
  const territorio =
    membresia.territorialUnitId === null
      ? null
      : await tx.territorialUnit.findUnique({
          where: { id: membresia.territorialUnitId },
          select: { name: true },
        });

  const codigo = nuevoCodigoFirmado();
  const creada = await tx.memberCredential.create({
    data: {
      publicCode: codigo.publicCode,
      signingKeyId: codigo.signingKeyId,
      signature: codigo.signature,
      membershipId: membresia.id,
      personId: membresia.personId,
      credentialKind: membresia.category,
      displayName: nombreCompleto(persona),
      territoryLabel: territorio?.name ?? null,
      expiresAt: membresia.expiresAt,
      createdByActorId: actor.actorId,
      updatedByActorId: actor.actorId,
    },
    select: { id: true, publicCode: true },
  });

  await recordAudit(tx, actor, {
    action: AUDIT_ACTIONS.CREDENTIAL_ISSUED,
    objectKind: 'MemberCredential',
    objectId: creada.id,
    outcome: 'SUCCESS',
    legalEntityId: membresia.legalEntityId,
    onBehalfOfPersonId: membresia.personId,
    metadata: { tipo: membresia.category, origen: 'activación de membresía' },
  });

  return { credentialId: creada.id, publicCode: creada.publicCode };
}

/**
 * Revoca las credenciales vivas de una membresía que termina.
 *
 * También se llama desde dentro de la transacción que da de baja o vence la
 * membresía. El estado vigente ya lo diría —la membresía terminada arrastra a
 * su credencial—, pero revocar deja **asiento**: quién, cuándo y por qué. Un
 * documento que deja de valer sin que conste el acto es un documento que nadie
 * puede explicar después.
 */
export async function revocarCredencialesDeMembresia(
  tx: Tx,
  actor: ActorContext,
  membresia: { id: string; personId: string; legalEntityId: string },
  motivo: string,
): Promise<number> {
  const vivas = await tx.memberCredential.findMany({
    where: { membershipId: membresia.id, revokedAt: null, status: { not: 'REPLACED' } },
    select: { id: true },
  });
  if (vivas.length === 0) return 0;

  const ahora = new Date();
  for (const una of vivas) {
    await tx.memberCredential.update({
      where: { id: una.id },
      data: {
        status: 'REVOKED',
        revokedAt: ahora,
        revokeReason: motivo,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CREDENTIAL_REVOKED,
      objectKind: 'MemberCredential',
      objectId: una.id,
      outcome: 'SUCCESS',
      legalEntityId: membresia.legalEntityId,
      onBehalfOfPersonId: membresia.personId,
      reason: motivo,
      metadata: { origen: 'fin de la membresía' },
    });
  }
  return vivas.length;
}

const MOTIVO_MINIMO = 15;

const motivo = z
  .string()
  .trim()
  .min(MOTIVO_MINIMO, { error: () => 'Escribe el motivo con tus palabras: al menos quince caracteres.' })
  .max(1000);

export const issueCredentialSchema = z.object({
  personId: z.uuid({ error: () => 'Elige a la persona titular.' }),
  kind: z.enum(['OFFICE_OR_REPRESENTATION', 'AUTHORIZED_PROFESSIONAL'], {
    error: () => 'Elige qué acredita esta credencial.',
  }),
  legalEntityId: z.uuid({ error: () => 'Elige la entidad que la emite.' }),
  /** Qué cargo o qué autorización. Va impreso, así que se escribe entero. */
  territoryLabel: z
    .string()
    .trim()
    .min(3, { error: () => 'Escribe el cargo, el territorio o la autorización que acredita.' })
    .max(160),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va en formato AAAA-MM-DD.' })
    .optional(),
  reason: motivo,
});
export type IssueCredentialInput = z.infer<typeof issueCredentialSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const campo = issue.path.join('.') || 'formulario';
    (salida[campo] ??= []).push(issue.message);
  }
  return salida;
}

/**
 * Emite una credencial que **no** acredita una membresía: un cargo o una
 * autorización profesional (PRD §7.4).
 *
 * Estas sí se ordenan desde una pantalla, porque no se derivan de ningún hecho
 * automático: alguien con la facultad decide que esta persona representa a la
 * organización o que su ejercicio profesional está autorizado. Por eso exigen
 * motivo escrito, igual que cualquier otro acto que produce un documento.
 */
export async function issueCredential(
  actor: ActorContext,
  input: IssueCredentialInput,
): Promise<UseCaseResult<{ credentialId: string; publicCode: string }>> {
  const parsed = issueCredentialSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can({ ...actor, reason: parsed.data.reason }, 'credentialing.credential.issue', {
    kind: 'MemberCredential',
    legalEntityId: parsed.data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const persona = await db().person.findUnique({
    where: { id: parsed.data.personId },
    select: { id: true, givenName: true, middleName: true, familyName: true, secondFamilyName: true },
  });
  if (persona === null) return fail(errors.notFound('la persona no está en el registro maestro'));

  const expiresAt =
    parsed.data.expiresOn === undefined ? null : new Date(`${parsed.data.expiresOn}T23:59:59.000Z`);
  if (expiresAt !== null && expiresAt <= new Date()) {
    return fail(errors.conflict('Una credencial no puede nacer vencida.', 'vigencia en el pasado'));
  }

  const codigo = nuevoCodigoFirmado();
  const creada = await transaction(async (tx) => {
    const fila = await tx.memberCredential.create({
      data: {
        publicCode: codigo.publicCode,
        signingKeyId: codigo.signingKeyId,
        signature: codigo.signature,
        personId: persona.id,
        credentialKind: parsed.data.kind,
        displayName: nombreCompleto(persona),
        territoryLabel: parsed.data.territoryLabel,
        expiresAt,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, publicCode: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CREDENTIAL_ISSUED,
      objectKind: 'MemberCredential',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: parsed.data.legalEntityId,
      onBehalfOfPersonId: persona.id,
      reason: parsed.data.reason,
      metadata: { tipo: parsed.data.kind, acredita: parsed.data.territoryLabel },
    });
    return fila;
  });

  return ok({ credentialId: creada.id, publicCode: creada.publicCode });
}

/* -------------------------------------------------------------------------- */
/* Revocación y reposición (F4-CRE-004)                                       */
/* -------------------------------------------------------------------------- */

export const revokeCredentialSchema = z.object({
  credentialId: z.uuid(),
  reason: motivo,
});
export type RevokeCredentialInput = z.infer<typeof revokeCredentialSchema>;

/**
 * Revoca una credencial. Surte efecto en el acto (PRD §7.4).
 *
 * No hay nada que invalidar aparte de la fila: el verificador lee el estado en
 * vivo en cada consulta, así que la credencial deja de valer en el mismo
 * instante en que se escribe la revocación. No existe copia cacheada de la
 * respuesta, y es a propósito.
 */
export async function revokeCredential(
  actor: ActorContext,
  input: RevokeCredentialInput,
): Promise<UseCaseResult<{ credentialId: string }>> {
  const parsed = revokeCredentialSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const fila = await db().memberCredential.findUnique({
    where: { id: parsed.data.credentialId },
    select: {
      id: true,
      status: true,
      revokedAt: true,
      personId: true,
      publicCode: true,
      membership: { select: { legalEntityId: true } },
    },
  });
  if (fila === null) return fail(errors.notFound('credencial inexistente'));

  const decision = can({ ...actor, reason: parsed.data.reason }, 'credentialing.credential.revoke', {
    kind: 'MemberCredential',
    id: fila.id,
    ...(fila.membership === null ? {} : { legalEntityId: fila.membership.legalEntityId }),
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (fila.revokedAt !== null) {
    return fail(errors.conflict('Esa credencial ya estaba revocada.', 'revocación repetida'));
  }
  if (fila.status === 'REPLACED') {
    return fail(
      errors.conflict('Esa credencial ya fue repuesta por otra; revoca la vigente.', 'credencial repuesta'),
    );
  }

  await transaction(async (tx) => {
    await tx.memberCredential.update({
      where: { id: fila.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: parsed.data.reason,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CREDENTIAL_REVOKED,
      objectKind: 'MemberCredential',
      objectId: fila.id,
      outcome: 'SUCCESS',
      ...(fila.membership === null ? {} : { legalEntityId: fila.membership.legalEntityId }),
      onBehalfOfPersonId: fila.personId,
      reason: parsed.data.reason,
      metadata: { codigo: fila.publicCode },
    });
  });

  return ok({ credentialId: fila.id });
}

export const replaceCredentialSchema = z.object({
  credentialId: z.uuid(),
  reason: motivo,
});
export type ReplaceCredentialInput = z.infer<typeof replaceCredentialSchema>;

/**
 * Repone una credencial: emite otra igual y marca la anterior como repuesta.
 *
 * Es lo que ocurre cuando alguien pierde la suya. **La anterior deja de valer**
 * —el código viejo que aparezca en una cartera ajena no acredita nada— y la
 * cadena queda escrita: la fila vieja apunta a la nueva. Reponer y revocar son
 * distintos a propósito: revocar dice «esta persona ya no acredita esto»,
 * reponer dice «lo sigue acreditando, con otro documento».
 */
export async function replaceCredential(
  actor: ActorContext,
  input: ReplaceCredentialInput,
): Promise<UseCaseResult<{ credentialId: string; publicCode: string }>> {
  const parsed = replaceCredentialSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const fila = await db().memberCredential.findUnique({
    where: { id: parsed.data.credentialId },
    select: {
      id: true,
      status: true,
      revokedAt: true,
      personId: true,
      credentialKind: true,
      displayName: true,
      territoryLabel: true,
      expiresAt: true,
      photoFileId: true,
      membershipId: true,
      membership: { select: { legalEntityId: true, status: true } },
    },
  });
  if (fila === null) return fail(errors.notFound('credencial inexistente'));

  const decision = can({ ...actor, reason: parsed.data.reason }, 'credentialing.credential.issue', {
    kind: 'MemberCredential',
    id: fila.id,
    ...(fila.membership === null ? {} : { legalEntityId: fila.membership.legalEntityId }),
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (fila.revokedAt !== null || fila.status === 'REPLACED') {
    return fail(
      errors.conflict('Solo se repone una credencial vigente.', `estado actual: ${fila.status}`),
    );
  }
  if (fila.membership !== null && !MEMBRESIA_VIVA.includes(fila.membership.status)) {
    return fail(
      errors.conflict(
        'La membresía que acreditaba ya terminó: no hay nada que reponer.',
        `membresía ${fila.membership.status}`,
      ),
    );
  }

  const codigo = nuevoCodigoFirmado();
  const nueva = await transaction(async (tx) => {
    const creada = await tx.memberCredential.create({
      data: {
        publicCode: codigo.publicCode,
        signingKeyId: codigo.signingKeyId,
        signature: codigo.signature,
        personId: fila.personId,
        membershipId: fila.membershipId,
        credentialKind: fila.credentialKind,
        displayName: fila.displayName,
        territoryLabel: fila.territoryLabel,
        photoFileId: fila.photoFileId,
        expiresAt: fila.expiresAt,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, publicCode: true },
    });

    await tx.memberCredential.update({
      where: { id: fila.id },
      data: {
        status: 'REPLACED',
        replacedByCredentialId: creada.id,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CREDENTIAL_REPLACED,
      objectKind: 'MemberCredential',
      objectId: fila.id,
      outcome: 'SUCCESS',
      ...(fila.membership === null ? {} : { legalEntityId: fila.membership.legalEntityId }),
      onBehalfOfPersonId: fila.personId,
      reason: parsed.data.reason,
      metadata: { repuestaPor: creada.publicCode },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CREDENTIAL_ISSUED,
      objectKind: 'MemberCredential',
      objectId: creada.id,
      outcome: 'SUCCESS',
      ...(fila.membership === null ? {} : { legalEntityId: fila.membership.legalEntityId }),
      onBehalfOfPersonId: fila.personId,
      reason: parsed.data.reason,
      metadata: { tipo: fila.credentialKind, origen: 'reposición' },
    });

    return creada;
  });

  return ok({ credentialId: nueva.id, publicCode: nueva.publicCode });
}

/* -------------------------------------------------------------------------- */
/* Verificador público (F4-CRE-003)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Lo que la página de verificación enseña. **Exactamente** los siete datos del
 * PRD §7.4, ni uno más: nombre autorizado, fotografía cuando corresponda, tipo,
 * estado, vigencia, territorio o cargo, y número público de verificación.
 *
 * Lo que no está aquí importa tanto como lo que está: no hay número de miembro,
 * ni correo, ni identificador interno, ni el motivo de una revocación. Quien
 * verifica necesita saber si el documento vale, no la historia de la persona.
 */
export interface VerificationResult {
  readonly found: boolean;
  readonly displayName: string | null;
  readonly photoFileId: string | null;
  readonly kind: CredentialKind | null;
  readonly status: MemberCredentialStatus | null;
  readonly issuedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly territoryLabel: string | null;
  readonly publicCode: string | null;
}

const NO_ENCONTRADA: VerificationResult = {
  found: false,
  displayName: null,
  photoFileId: null,
  kind: null,
  status: null,
  issuedAt: null,
  expiresAt: null,
  territoryLabel: null,
  publicCode: null,
};

export interface HuellaDeConsulta {
  /** País declarado por la red de entrega, si lo declara. Nada más fino. */
  readonly countryCodeHint?: string | null;
  readonly userAgentClass?: UserAgentClass | null;
}

/** Trunca a la hora en punto: la medición es agregada, no un rastro. */
function horaEnPunto(momento: Date): Date {
  const truncada = new Date(momento);
  truncada.setUTCMinutes(0, 0, 0);
  return truncada;
}

const RESULTADO: Record<MemberCredentialStatus, CredentialVerificationResult> = {
  ACTIVE: 'VALID',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  // Una credencial repuesta ya no acredita: el documento que vale es el nuevo.
  // Se cuenta como revocada porque para quien la enseña el efecto es el mismo.
  REPLACED: 'REVOKED',
};

/**
 * Registra la consulta de forma agregada (PRD §7.4).
 *
 * **No se crea un perfil de quien escanea.** No se guarda la dirección, ni un
 * identificador de sesión, ni la hora exacta: solo la hora en punto, la clase
 * de dispositivo y, si la red de entrega lo declara, el país. Con eso se puede
 * responder «cuánto se usa el verificador» y no se puede responder «quién miró
 * la credencial de quién», que es exactamente el equilibrio que pide el PRD.
 *
 * Si el registro falla, la verificación **sigue adelante**: medir no puede
 * impedir que alguien compruebe un documento en una puerta.
 */
async function registrarConsulta(
  queriedCode: string,
  result: CredentialVerificationResult,
  credentialId: string | null,
  huella: HuellaDeConsulta,
): Promise<void> {
  try {
    await db().credentialVerification.create({
      data: {
        credentialId,
        queriedCode: queriedCode.slice(0, 40),
        result,
        occurredAtHour: horaEnPunto(new Date()),
        countryCodeHint: huella.countryCodeHint ?? null,
        userAgentClass: huella.userAgentClass ?? null,
      },
    });
  } catch (error) {
    logger.warn('No se pudo registrar la consulta al verificador', {
      module: 'credentialing',
      outcome: 'failed',
      context: { result, error },
    });
  }
}

/**
 * Verifica un código. **Sin actor y sin permisos: es la parte pública.**
 *
 * Lo que la hace segura no es quién pregunta, sino que solo devuelve los siete
 * campos autorizados y que el código es opaco: conocer uno no permite deducir
 * otro. La firma descarta los inventados antes de tocar la base; los tecleados
 * a mano se buscan igual, porque el estado guardado es la respuesta verdadera
 * por los dos caminos.
 */
export async function verifyCredential(
  entrada: string,
  huella: HuellaDeConsulta = {},
): Promise<VerificationResult> {
  const lectura = leerToken(entrada);
  if (lectura.clase === 'INVALIDO') {
    await registrarConsulta(entrada, 'NOT_FOUND', null, huella);
    return NO_ENCONTRADA;
  }

  const fila = await db().memberCredential.findUnique({
    where: { publicCode: lectura.publicCode },
    select: {
      id: true,
      publicCode: true,
      displayName: true,
      photoFileId: true,
      credentialKind: true,
      status: true,
      revokedAt: true,
      issuedAt: true,
      expiresAt: true,
      territoryLabel: true,
      membership: { select: { status: true } },
    },
  });

  if (fila === null) {
    await registrarConsulta(lectura.publicCode, 'NOT_FOUND', null, huella);
    return NO_ENCONTRADA;
  }

  const estado = estadoVigente(fila);
  await registrarConsulta(lectura.publicCode, RESULTADO[estado], fila.id, huella);

  return {
    found: true,
    displayName: fila.displayName,
    // La fotografía solo cuando la credencial vale. Enseñar la cara de alguien
    // junto a un documento revocado no ayuda a verificar nada y expone a la
    // persona en la peor situación posible.
    photoFileId: estado === 'ACTIVE' ? fila.photoFileId : null,
    kind: fila.credentialKind,
    status: estado,
    issuedAt: fila.issuedAt,
    expiresAt: fila.expiresAt,
    territoryLabel: fila.territoryLabel,
    publicCode: fila.publicCode,
  };
}

/* -------------------------------------------------------------------------- */
/* Lectura: la propia y la de gestión (F4-CRE-002)                            */
/* -------------------------------------------------------------------------- */

export interface CredentialRow {
  readonly id: string;
  readonly publicCode: string;
  readonly token: string;
  readonly personId: string;
  readonly displayName: string;
  readonly kind: CredentialKind;
  readonly storedStatus: MemberCredentialStatus;
  readonly status: MemberCredentialStatus;
  readonly issuedAt: Date;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokeReason: string | null;
  readonly territoryLabel: string | null;
  readonly memberNumber: string | null;
  readonly legalEntityId: string | null;
}

const SELECCION = {
  id: true,
  publicCode: true,
  signingKeyId: true,
  signature: true,
  personId: true,
  displayName: true,
  credentialKind: true,
  status: true,
  issuedAt: true,
  expiresAt: true,
  revokedAt: true,
  revokeReason: true,
  territoryLabel: true,
  membership: { select: { status: true, memberNumber: true, legalEntityId: true } },
} as const;

type FilaCruda = {
  id: string;
  publicCode: string;
  signingKeyId: string;
  signature: string;
  personId: string;
  displayName: string;
  credentialKind: CredentialKind;
  status: MemberCredentialStatus;
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  territoryLabel: string | null;
  membership: { status: MembershipStatus; memberNumber: string; legalEntityId: string } | null;
};

function aFila(fila: FilaCruda): CredentialRow {
  return {
    id: fila.id,
    publicCode: fila.publicCode,
    token: tokenDe(fila),
    personId: fila.personId,
    displayName: fila.displayName,
    kind: fila.credentialKind,
    storedStatus: fila.status,
    status: estadoVigente(fila),
    issuedAt: fila.issuedAt,
    expiresAt: fila.expiresAt,
    revokedAt: fila.revokedAt,
    revokeReason: fila.revokeReason,
    territoryLabel: fila.territoryLabel,
    memberNumber: fila.membership?.memberNumber ?? null,
    legalEntityId: fila.membership?.legalEntityId ?? null,
  };
}

/** Las credenciales de una persona. La propia con `read_own`; la ajena, no. */
export async function personCredentials(
  actor: ActorContext,
  personId: string,
): Promise<UseCaseResult<CredentialRow[]>> {
  const propia = personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'credentialing.credential.read_own' : 'credentialing.credential.read',
    { kind: 'MemberCredential', containsPersonalData: true },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().memberCredential.findMany({
    where: { personId },
    orderBy: { issuedAt: 'desc' },
    select: SELECCION,
  });
  return ok(filas.map(aFila));
}

/**
 * Una credencial concreta, para dibujarla o descargarla.
 *
 * Descargar la propia deja asiento (`CREDENTIAL_DOWNLOADED`) porque es la
 * entrega de un documento: si mañana aparece una credencial impresa que no
 * debería circular, la pregunta «cuándo se descargó y quién» tiene respuesta.
 */
export async function credentialForDownload(
  actor: ActorContext,
  credentialId: string,
): Promise<UseCaseResult<CredentialRow>> {
  const fila = await db().memberCredential.findUnique({
    where: { id: credentialId },
    select: SELECCION,
  });
  if (fila === null) return fail(errors.notFound('credencial inexistente'));

  const propia = fila.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'credentialing.credential.read_own' : 'credentialing.credential.read',
    { kind: 'MemberCredential', id: fila.id, containsPersonalData: true },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const datos = aFila(fila);
  if (datos.status !== 'ACTIVE') {
    return fail(
      errors.conflict(
        'Esa credencial ya no está vigente, así que no se puede descargar.',
        `estado vigente: ${datos.status}`,
      ),
    );
  }

  await transaction(async (tx) => {
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CREDENTIAL_DOWNLOADED,
      objectKind: 'MemberCredential',
      objectId: fila.id,
      outcome: 'SUCCESS',
      ...(datos.legalEntityId === null ? {} : { legalEntityId: datos.legalEntityId }),
      onBehalfOfPersonId: fila.personId,
      metadata: { codigo: fila.publicCode, tipo: fila.credentialKind },
    });
  });

  return ok(datos);
}

export interface CredentialFilters {
  readonly query?: string;
  readonly kind?: CredentialKind;
  /** Estado **vigente**, no el guardado: es lo que quien gestiona busca. */
  readonly status?: MemberCredentialStatus;
}

/** El listado de gestión: quién tiene qué credencial y cómo está hoy. */
export async function credentialRegistry(
  actor: ActorContext,
  filtros: CredentialFilters = {},
): Promise<UseCaseResult<CredentialRow[]>> {
  const decision = can(actor, 'credentialing.credential.read', {
    kind: 'MemberCredential',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const texto = (filtros.query ?? '').trim();
  const filas = await db().memberCredential.findMany({
    where: {
      ...(filtros.kind === undefined ? {} : { credentialKind: filtros.kind }),
      ...(texto === ''
        ? {}
        : {
            OR: [
              { publicCode: { contains: texto.toUpperCase() } },
              { displayName: { contains: texto, mode: 'insensitive' as const } },
              { membership: { memberNumber: { contains: texto, mode: 'insensitive' as const } } },
            ],
          }),
    },
    orderBy: { issuedAt: 'desc' },
    take: 300,
    select: SELECCION,
  });

  const mapeadas = filas.map(aFila);
  // El filtro por estado se aplica sobre el estado **vigente**, que se calcula
  // aquí y no está en ninguna columna. Filtrarlo en la consulta devolvería lo
  // que dice la fila y no lo que la credencial vale hoy.
  return ok(filtros.status === undefined ? mapeadas : mapeadas.filter((una) => una.status === filtros.status));
}

/** Consultas al verificador, agregadas por día. Sin ninguna traza personal. */
export async function verificationSummary(
  actor: ActorContext,
  desde: Date,
): Promise<UseCaseResult<{ dia: string; result: CredentialVerificationResult; consultas: number }[]>> {
  const decision = can(actor, 'credentialing.credential.read', { kind: 'MemberCredential', isBulk: true });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().credentialVerification.findMany({
    where: { occurredAtHour: { gte: desde } },
    select: { occurredAtHour: true, result: true },
  });

  const contador = new Map<string, number>();
  for (const fila of filas) {
    const clave = `${fila.occurredAtHour.toISOString().slice(0, 10)}|${fila.result}`;
    contador.set(clave, (contador.get(clave) ?? 0) + 1);
  }

  return ok(
    [...contador.entries()]
      .map(([clave, consultas]) => {
        const [dia, result] = clave.split('|') as [string, CredentialVerificationResult];
        return { dia, result, consultas };
      })
      .sort((a, b) => (a.dia === b.dia ? a.result.localeCompare(b.result) : b.dia.localeCompare(a.dia))),
  );
}
