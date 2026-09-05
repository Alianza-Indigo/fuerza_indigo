import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { newPublicId } from '@/platform/kernel/ids';
import { env } from '@/platform/config/env';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { issueDocument } from '@/modules/documents';
import {
  credencialValida,
  emitirCredencial,
  huellaDeCredencial,
  nuevaSalDeProceso,
  nuevoCodigoDeAcuse,
  nuevoCodigoDeVerificacion,
} from '../domain/credentials';
import type { VoteContext, VoteMethod, VoteProcessStatus } from '@prisma-client/enums';

/**
 * Procesos de votación (PRD §9.5; ADR-0012; F5-ELE-004, F5-ELE-005).
 *
 * **El depósito de la boleta no deja asiento de auditoría.** Es la única
 * excepción a la regla de que todo acto se asienta, y no es un descuido: un
 * asiento lleva actor e instante, y nacería en la misma transacción que la
 * boleta. Bastaría comparar el instante del asiento con el orden físico de las
 * filas para deshacer el secreto que el modelo protege con tanto cuidado. Lo
 * que sí se asienta es todo lo demás —abrir, emitir credenciales, cerrar,
 * escrutar, certificar—, que son actos identificados y deben serlo.
 *
 * **Nadie puede probar por quién votó.** Quien deposita recibe un código de
 * verificación y comprueba en la lista publicada que su boleta se contó. La
 * lista enseña los códigos, no el sentido: verificar inclusión no permite
 * demostrar el voto ante un tercero, y sin esa demostración la coacción se
 * queda sin instrumento.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

function secretoDeVoto(): string | null {
  const valor = env().VOTE_CREDENTIAL_SECRET;
  return valor === undefined || valor === null || valor === '' ? null : valor;
}

/** Opción de una papeleta. El código es lo que se guarda en la boleta. */
export const voteOptionSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,39}$/, {
    error: () => 'El código de la opción lleva mayúsculas, números y guiones bajos.',
  }),
  label: z.string().trim().min(1).max(200),
});

export type VoteOption = z.infer<typeof voteOptionSchema>;

export const scheduleVoteProcessSchema = z.object({
  context: z.enum(['ASSEMBLY_ITEM', 'ELECTION', 'COLLECTIVE_CONSULTATION', 'DISCIPLINARY_APPEAL']),
  assemblyId: z.uuid().nullable().default(null),
  agendaItemId: z.uuid().nullable().default(null),
  electionId: z.uuid().nullable().default(null),
  bargainingFileId: z.uuid().nullable().default(null),
  title: z.string().trim().min(5).max(200),
  method: z.enum(['SECRET', 'OPEN_ROLL_CALL']),
  options: z.array(voteOptionSchema).min(2, {
    error: () => 'Una votación necesita al menos dos opciones. Con una sola no se vota, se ratifica.',
  }).max(60),
  rosterSnapshotId: z.uuid(),
  opensAt: z.string().trim().min(16).max(40),
  closesAt: z.string().trim().min(16).max(40),
});

export type ScheduleVoteProcessInput = z.infer<typeof scheduleVoteProcessSchema>;

function comoInstante(valor: string): Date {
  return new Date(valor.length <= 16 ? `${valor}:00Z` : valor);
}

/**
 * Programa un proceso de votación sobre un padrón congelado.
 *
 * Las opciones quedan fijas al abrir: el motor retira el privilegio de
 * actualización sobre la columna una vez abierto. Cambiar una opción con
 * boletas depositadas cambiaría el significado de votos ya emitidos.
 */
export async function scheduleVoteProcess(
  actor: ActorContext,
  input: ScheduleVoteProcessInput,
): Promise<UseCaseResult<{ voteProcessId: string; publicId: string }>> {
  const parsed = scheduleVoteProcessSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'voting.process.manage', { kind: 'VoteProcess' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  if (secretoDeVoto() === null) {
    return fail(
      errors.conflict(
        'Falta `VOTE_CREDENTIAL_SECRET` en el entorno. Sin él no se pueden firmar credenciales de voto y el proceso no se abre.',
      ),
    );
  }

  const abre = comoInstante(data.opensAt);
  const cierra = comoInstante(data.closesAt);
  if (Number.isNaN(abre.getTime()) || Number.isNaN(cierra.getTime())) {
    return fail(errors.validation({ opensAt: ['Las fechas y horas no son válidas.'] }));
  }
  if (cierra <= abre) {
    return fail(errors.validation({ closesAt: ['La votación no puede cerrar antes de abrir.'] }));
  }

  const codigos = new Set(data.options.map((opcion) => opcion.code));
  if (codigos.size !== data.options.length) {
    return fail(errors.validation({ options: ['Hay códigos de opción repetidos.'] }));
  }

  const padron = await db().assemblyRosterSnapshot.findUnique({
    where: { id: data.rosterSnapshotId },
    select: { id: true, entryCount: true },
  });
  if (padron === null) return fail(errors.notFound('Ese padrón congelado no existe.'));

  const publicId = newPublicId();
  const creado = await transaction(async (tx) => {
    const fila = await tx.voteProcess.create({
      data: {
        publicId,
        context: data.context,
        assemblyId: data.assemblyId,
        agendaItemId: data.agendaItemId,
        electionId: data.electionId,
        bargainingFileId: data.bargainingFileId,
        title: data.title,
        method: data.method,
        options: data.options,
        rosterSnapshotId: padron.id,
        credentialSalt: nuevaSalDeProceso(),
        opensAt: abre,
        closesAt: cierra,
        status: 'SCHEDULED',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.VOTE_PROCESS_SCHEDULED,
      objectKind: 'VoteProcess',
      objectId: fila.id,
      outcome: 'SUCCESS',
      metadata: {
        titulo: data.title,
        contexto: data.context,
        metodo: data.method,
        opciones: data.options.map((opcion) => opcion.code),
        padron: padron.id,
        elegiblesEnPadron: padron.entryCount,
      },
    });

    return fila;
  });

  return ok({ voteProcessId: creado.id, publicId });
}

export interface IssuedVoteCredential {
  readonly membershipId: string;
  readonly memberNumber: string;
  readonly personName: string;
  /** El valor de la credencial. **Existe solo en esta respuesta.** */
  readonly credential: string;
  readonly receiptCode: string;
}

export const issueVoteCredentialsSchema = z.object({ voteProcessId: z.uuid() });

/**
 * Emite las credenciales de un proceso y abre la votación.
 *
 * Devuelve los valores **una sola vez**: el servidor no los guarda, así que
 * esta respuesta es la única oportunidad de entregarlos. Quien la ejecuta se
 * lleva la lista para repartirla; si se pierde, no hay forma de reemitir la
 * misma credencial, solo de anular el proceso y repetirlo.
 *
 * Del lado identificado quedan `VoteEligibility` —con la fecha civil, sin
 * hora— y el acuse. Ni el valor ni su huella.
 */
export async function issueVoteCredentials(
  actor: ActorContext,
  input: z.infer<typeof issueVoteCredentialsSchema>,
): Promise<UseCaseResult<{ issued: readonly IssuedVoteCredential[]; ineligible: number }>> {
  const parsed = issueVoteCredentialsSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'voting.credential.issue', { kind: 'VoteProcess' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const secreto = secretoDeVoto();
  if (secreto === null) {
    return fail(errors.conflict('Falta `VOTE_CREDENTIAL_SECRET` en el entorno. No se pueden firmar credenciales.'));
  }

  const proceso = await db().voteProcess.findUnique({
    where: { id: parsed.data.voteProcessId },
    select: {
      id: true,
      publicId: true,
      status: true,
      credentialSalt: true,
      rosterSnapshot: {
        select: {
          id: true,
          entries: {
            select: {
              membershipId: true,
              memberNumber: true,
              hasVote: true,
              membership: {
                select: {
                  person: {
                    select: {
                      givenName: true,
                      middleName: true,
                      familyName: true,
                      secondFamilyName: true,
                      preferredName: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      _count: { select: { eligibilities: true } },
    },
  });
  if (proceso === null) return fail(errors.notFound('Ese proceso de votación no existe.'));
  if (proceso.status !== 'SCHEDULED') {
    return fail(errors.conflict('Las credenciales se emiten una vez, antes de abrir la votación.'));
  }
  if (proceso._count.eligibilities > 0) {
    return fail(errors.conflict('Las credenciales de este proceso ya se emitieron.'));
  }
  if (proceso.credentialSalt === null) {
    return fail(errors.conflict('Este proceso perdió su sal de firma. No se pueden emitir credenciales.'));
  }

  const conVoto = proceso.rosterSnapshot.entries.filter((entrada) => entrada.hasVote);
  const sinVoto = proceso.rosterSnapshot.entries.length - conVoto.length;
  if (conVoto.length === 0) {
    return fail(errors.conflict('Nadie del padrón tiene derecho a voto en este proceso.'));
  }

  const hoy = new Date();
  const soloFecha = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));

  const emitidas: IssuedVoteCredential[] = conVoto.map((entrada) => ({
    membershipId: entrada.membershipId,
    memberNumber: entrada.memberNumber,
    personName: nombreCompleto(entrada.membership.person),
    credential: emitirCredencial(secreto, proceso.credentialSalt!),
    receiptCode: nuevoCodigoDeAcuse(),
  }));

  await transaction(async (tx) => {
    await tx.voteEligibility.createMany({
      data: [
        ...conVoto.map((entrada) => ({
          voteProcessId: proceso.id,
          membershipId: entrada.membershipId,
          eligible: true,
          credentialIssued: true,
          credentialIssuedOn: soloFecha,
          createdByActorId: actor.actorId,
          updatedByActorId: actor.actorId,
        })),
        ...proceso.rosterSnapshot.entries
          .filter((entrada) => !entrada.hasVote)
          .map((entrada) => ({
            voteProcessId: proceso.id,
            membershipId: entrada.membershipId,
            eligible: false,
            reasonIfNot: 'NO_POLITICAL_RIGHTS' as const,
            credentialIssued: false,
            createdByActorId: actor.actorId,
            updatedByActorId: actor.actorId,
          })),
      ],
    });

    await tx.voteReceipt.createMany({
      data: emitidas.map((credencial) => ({
        voteProcessId: proceso.id,
        membershipId: credencial.membershipId,
        receiptCode: credencial.receiptCode,
        issuedOn: soloFecha,
      })),
    });

    await tx.voteProcess.update({
      where: { id: proceso.id },
      data: { status: 'OPEN', updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.VOTE_CREDENTIAL_ISSUED,
      objectKind: 'VoteProcess',
      objectId: proceso.id,
      outcome: 'SUCCESS',
      metadata: { proceso: proceso.publicId, credenciales: emitidas.length, sinDerechoAVoto: sinVoto },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.VOTE_PROCESS_OPENED,
      objectKind: 'VoteProcess',
      objectId: proceso.id,
      outcome: 'SUCCESS',
      metadata: { proceso: proceso.publicId },
    });
  });

  return ok({ issued: emitidas, ineligible: sinVoto });
}

export const castBallotSchema = z.object({
  voteProcessId: z.uuid(),
  credential: z.string().trim().min(20).max(400),
  /** Código de la opción elegida, o nulo para votar en blanco. */
  optionCode: z.string().trim().max(40).nullable().default(null),
});

export type CastBallotInput = z.infer<typeof castBallotSchema>;

/**
 * Deposita una boleta.
 *
 * **No recibe un actor.** No es un olvido: recibirlo invitaría a usarlo, y usarlo
 * —para auditar, para limitar, para lo que fuera— crearía el vínculo que todo
 * este diseño existe para no crear. Lo único que autoriza aquí es la credencial,
 * y la credencial no dice de quién es.
 *
 * La boleta y la constancia de credencial gastada nacen en la misma transacción.
 * Ninguna de las dos tiene tiempo ni identidad.
 */
export async function castBallot(
  input: CastBallotInput,
): Promise<UseCaseResult<{ verificationCode: string }>> {
  const parsed = castBallotSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const secreto = secretoDeVoto();
  if (secreto === null) {
    return fail(errors.conflict('Falta `VOTE_CREDENTIAL_SECRET` en el entorno.'));
  }

  const data = parsed.data;
  const proceso = await db().voteProcess.findUnique({
    where: { id: data.voteProcessId },
    select: { id: true, status: true, opensAt: true, closesAt: true, options: true, credentialSalt: true },
  });
  if (proceso === null) return fail(errors.notFound('Ese proceso de votación no existe.'));
  if (proceso.credentialSalt === null) {
    return fail(errors.conflict('Este proceso ya está certificado. No admite más boletas.'));
  }

  const ahora = new Date();
  if (proceso.status !== 'OPEN' || ahora < proceso.opensAt || ahora > proceso.closesAt) {
    return fail(errors.conflict('La votación no está abierta.'));
  }

  if (!credencialValida(secreto, proceso.credentialSalt, data.credential)) {
    return fail(errors.forbidden('Esa credencial no es válida para esta votación.'));
  }

  const opciones = voteOptionSchema.array().safeParse(proceso.options);
  if (!opciones.success) {
    return fail(errors.conflict('Las opciones de este proceso no son legibles. No se deposita a ciegas.'));
  }
  if (data.optionCode !== null && !opciones.data.some((opcion) => opcion.code === data.optionCode)) {
    return fail(errors.validation({ optionCode: ['Esa opción no está en la papeleta.'] }));
  }

  const huella = huellaDeCredencial(data.credential);
  const yaGastada = await db().spentVoteCredential.findUnique({
    where: { credentialHash: huella },
    select: { id: true },
  });
  if (yaGastada !== null) {
    return fail(errors.conflict('Esa credencial ya se usó. Cada credencial deposita una sola vez.'));
  }

  const verificationCode = nuevoCodigoDeVerificacion();

  try {
    await transaction(async (tx) => {
      // El orden importa poco, pero la transacción sí: o quedan las dos filas o
      // no queda ninguna. Una boleta sin credencial gastada permitiría depositar
      // otra vez; una credencial gastada sin boleta perdería un voto emitido.
      await tx.spentVoteCredential.create({ data: { voteProcessId: proceso.id, credentialHash: huella } });
      await tx.ballot.create({
        data: {
          voteProcessId: proceso.id,
          selection: data.optionCode === null ? {} : { option: data.optionCode },
          nullifiedReason: data.optionCode === null ? 'BLANK' : null,
          verificationCode,
        },
      });
    });
  } catch {
    // El índice único de la huella es la última defensa contra dos depósitos
    // simultáneos con la misma credencial. Se traduce al mismo mensaje que la
    // comprobación de arriba: quien lo lea no tiene por qué distinguir cuál de
    // las dos lo detuvo.
    return fail(errors.conflict('Esa credencial ya se usó. Cada credencial deposita una sola vez.'));
  }

  return ok({ verificationCode });
}

export const closeVoteProcessSchema = z.object({ voteProcessId: z.uuid() });

/** Cierra la votación. A partir de aquí no se admiten más boletas. */
export async function closeVoteProcess(
  actor: ActorContext,
  input: z.infer<typeof closeVoteProcessSchema>,
): Promise<UseCaseResult<{ closed: true }>> {
  const parsed = closeVoteProcessSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'voting.process.manage', { kind: 'VoteProcess' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const proceso = await db().voteProcess.findUnique({
    where: { id: parsed.data.voteProcessId },
    select: { id: true, publicId: true, status: true },
  });
  if (proceso === null) return fail(errors.notFound('Ese proceso de votación no existe.'));
  if (proceso.status !== 'OPEN') return fail(errors.conflict('Ese proceso no está abierto.'));

  await transaction(async (tx) => {
    await tx.voteProcess.update({
      where: { id: proceso.id },
      data: { status: 'CLOSED', updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.VOTE_PROCESS_CLOSED,
      objectKind: 'VoteProcess',
      objectId: proceso.id,
      outcome: 'SUCCESS',
      metadata: { proceso: proceso.publicId },
    });
  });

  return ok({ closed: true });
}

export interface TallyResult {
  readonly byOption: readonly { readonly code: string; readonly label: string; readonly votes: number }[];
  readonly blank: number;
  readonly invalid: number;
  readonly totalBallots: number;
  readonly credentialsIssued: number;
  readonly credentialsSpent: number;
  /** Credenciales emitidas que nadie depositó. No dice de quién: no puede. */
  readonly abstained: number;
  readonly verificationCodes: readonly string[];
}

export const tallyVoteProcessSchema = z.object({ voteProcessId: z.uuid() });

/**
 * Escruta una votación cerrada.
 *
 * Cuenta las boletas y publica los códigos de verificación **sin su sentido**:
 * quien depositó comprueba que su código está en la lista, y con eso sabe que
 * su boleta se contó. Que el código no venga acompañado del voto es lo que
 * impide usar la lista para probar ante nadie qué se votó.
 *
 * La diferencia entre credenciales emitidas y consumidas es la abstención. El
 * sistema la cuenta y no la atribuye: atribuirla exigiría exactamente el
 * vínculo que se decidió no guardar (ADR-0012).
 */
export async function tallyVoteProcess(
  actor: ActorContext,
  input: z.infer<typeof tallyVoteProcessSchema>,
): Promise<UseCaseResult<TallyResult>> {
  const parsed = tallyVoteProcessSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'voting.tally.run', { kind: 'VoteProcess' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const proceso = await db().voteProcess.findUnique({
    where: { id: parsed.data.voteProcessId },
    select: { id: true, publicId: true, status: true, options: true },
  });
  if (proceso === null) return fail(errors.notFound('Ese proceso de votación no existe.'));
  if (proceso.status === 'OPEN') {
    return fail(errors.conflict('La votación sigue abierta. Ciérrala antes de escrutar.'));
  }
  if (proceso.status !== 'CLOSED') {
    return fail(errors.conflict('Ese proceso ya se escrutó o está anulado.'));
  }

  const opciones = voteOptionSchema.array().safeParse(proceso.options);
  if (!opciones.success) {
    return fail(errors.conflict('Las opciones de este proceso no son legibles.'));
  }

  const [boletas, emitidas, gastadas] = await Promise.all([
    db().ballot.findMany({
      where: { voteProcessId: proceso.id },
      select: { selection: true, nullifiedReason: true, verificationCode: true },
    }),
    db().voteEligibility.count({ where: { voteProcessId: proceso.id, credentialIssued: true } }),
    db().spentVoteCredential.count({ where: { voteProcessId: proceso.id } }),
  ]);

  const conteo = new Map<string, number>(opciones.data.map((opcion) => [opcion.code, 0]));
  let blank = 0;
  let invalid = 0;

  for (const boleta of boletas) {
    if (boleta.nullifiedReason === 'BLANK') {
      blank += 1;
      continue;
    }
    const seleccion = boleta.selection;
    const codigo =
      typeof seleccion === 'object' && seleccion !== null && !Array.isArray(seleccion)
        ? (seleccion as Record<string, unknown>)['option']
        : null;
    if (typeof codigo !== 'string' || !conteo.has(codigo)) {
      invalid += 1;
      continue;
    }
    conteo.set(codigo, (conteo.get(codigo) ?? 0) + 1);
  }

  const byOption = opciones.data.map((opcion) => ({
    code: opcion.code,
    label: opcion.label,
    votes: conteo.get(opcion.code) ?? 0,
  }));

  // Los códigos se publican ordenados alfabéticamente y no por inserción: el
  // orden de inserción es el orden de depósito, y publicarlo permitiría
  // reconstruir la secuencia de la jornada.
  const verificationCodes = boletas.map((boleta) => boleta.verificationCode).sort((a, b) => a.localeCompare(b, 'en'));

  const resultado: TallyResult = {
    byOption,
    blank,
    invalid,
    totalBallots: boletas.length,
    credentialsIssued: emitidas,
    credentialsSpent: gastadas,
    abstained: Math.max(0, emitidas - gastadas),
    verificationCodes,
  };

  await transaction(async (tx) => {
    await tx.voteProcess.update({
      where: { id: proceso.id },
      data: {
        status: 'TALLIED',
        talliedAt: new Date(),
        results: {
          byOption: [...byOption],
          blank,
          invalid,
          totalBallots: boletas.length,
          credentialsIssued: emitidas,
          credentialsSpent: gastadas,
          abstained: resultado.abstained,
          verificationCodes: [...verificationCodes],
        },
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.VOTE_TALLIED,
      objectKind: 'VoteProcess',
      objectId: proceso.id,
      outcome: 'SUCCESS',
      metadata: {
        proceso: proceso.publicId,
        boletas: boletas.length,
        blancos: blank,
        nulos: invalid,
        credencialesEmitidas: emitidas,
        credencialesConsumidas: gastadas,
      },
    });
  });

  return ok(resultado);
}

export const certifyVoteProcessSchema = z.object({
  voteProcessId: z.uuid(),
  templateCode: z.string().trim().toUpperCase().min(3).max(60),
});

/**
 * Certifica los resultados y **destruye la clave del proceso**.
 *
 * Borrar la sal es irreversible y esa es su razón de ser: a partir de aquí
 * nadie puede fabricar una credencial válida para este proceso, ni siquiera
 * quien conserve el secreto maestro del entorno. Certificar cierra la urna de
 * verdad, no solo en el estado de una columna.
 *
 * Emite el acta de resultados con la plantilla que se le indique, y la deja
 * enlazada al proceso.
 */
export async function certifyVoteProcess(
  actor: ActorContext,
  input: z.infer<typeof certifyVoteProcessSchema>,
): Promise<UseCaseResult<{ folio: string; keyDestroyed: true }>> {
  const parsed = certifyVoteProcessSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'voting.tally.certify', { kind: 'VoteProcess' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienCertifica = actor.userId;
  if (quienCertifica === null || quienCertifica === undefined) {
    return fail(errors.forbidden('Certificar un resultado es un acto de una persona: exige una cuenta.'));
  }

  const proceso = await db().voteProcess.findUnique({
    where: { id: parsed.data.voteProcessId },
    select: { id: true, publicId: true, title: true, status: true, results: true, talliedAt: true },
  });
  if (proceso === null) return fail(errors.notFound('Ese proceso de votación no existe.'));
  if (proceso.status !== 'TALLIED') {
    return fail(errors.conflict('Solo se certifica un proceso escrutado.'));
  }
  const resultado = comoResultado(proceso.results);
  if (resultado === null) {
    return fail(errors.conflict('El proceso no tiene resultados legibles. No se certifica lo que no se puede leer.'));
  }

  const documento = await issueDocument(actor, {
    templateCode: parsed.data.templateCode,
    subjectKind: 'VOTE_PROCESS',
    subjectId: proceso.id,
    variables: {
      proceso: proceso.publicId,
      titulo: proceso.title,
      escrutadoEl: proceso.talliedAt === null ? '' : proceso.talliedAt.toISOString(),
      resultados: resultado.byOption.map((opcion) => `${opcion.label}: ${opcion.votes}`).join('\n'),
      blancos: String(resultado.blank),
      nulos: String(resultado.invalid),
      totalDeBoletas: String(resultado.totalBallots),
      credencialesEmitidas: String(resultado.credentialsIssued),
      credencialesConsumidas: String(resultado.credentialsSpent),
      abstenciones: String(resultado.abstained),
      codigosDeVerificacion: resultado.verificationCodes.join(' '),
    },
  });
  if (!documento.ok) return fail(documento.error);

  await transaction(async (tx) => {
    await tx.voteProcess.update({
      where: { id: proceso.id },
      data: {
        status: 'CERTIFIED',
        certifiedById: quienCertifica,
        resultDocumentId: documento.data.documentId,
        // La destrucción de la clave del proceso (ADR-0012, punto 6).
        credentialSalt: null,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.VOTE_CERTIFIED,
      objectKind: 'VoteProcess',
      objectId: proceso.id,
      outcome: 'SUCCESS',
      metadata: {
        proceso: proceso.publicId,
        folio: documento.data.folio,
        claveDestruida: true,
      },
    });
  });

  return ok({ folio: documento.data.folio, keyDestroyed: true });
}

export interface VoteProcessRow {
  readonly id: string;
  readonly publicId: string;
  readonly title: string;
  readonly context: VoteContext;
  readonly method: VoteMethod;
  readonly status: VoteProcessStatus;
  readonly opensAt: Date;
  readonly closesAt: Date;
  readonly talliedAt: Date | null;
  readonly options: readonly VoteOption[];
  readonly results: TallyResult | null;
  readonly keyDestroyed: boolean;
  readonly assemblyId: string | null;
  readonly agendaItemId: string | null;
}

function comoResultado(valor: unknown): TallyResult | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  const bruto = valor as Record<string, unknown>;
  const opciones = Array.isArray(bruto['byOption']) ? bruto['byOption'] : [];
  return {
    byOption: opciones.filter(
      (opcion): opcion is { code: string; label: string; votes: number } =>
        typeof opcion === 'object' && opcion !== null,
    ),
    blank: typeof bruto['blank'] === 'number' ? bruto['blank'] : 0,
    invalid: typeof bruto['invalid'] === 'number' ? bruto['invalid'] : 0,
    totalBallots: typeof bruto['totalBallots'] === 'number' ? bruto['totalBallots'] : 0,
    credentialsIssued: typeof bruto['credentialsIssued'] === 'number' ? bruto['credentialsIssued'] : 0,
    credentialsSpent: typeof bruto['credentialsSpent'] === 'number' ? bruto['credentialsSpent'] : 0,
    abstained: typeof bruto['abstained'] === 'number' ? bruto['abstained'] : 0,
    verificationCodes: Array.isArray(bruto['verificationCodes'])
      ? bruto['verificationCodes'].filter((codigo): codigo is string => typeof codigo === 'string')
      : [],
  };
}

export async function voteProcessList(
  actor: ActorContext,
  filters: { readonly assemblyId?: string; readonly electionId?: string } = {},
): Promise<UseCaseResult<readonly VoteProcessRow[]>> {
  const decision = can(actor, 'voting.process.read', { kind: 'VoteProcess' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().voteProcess.findMany({
    where: {
      ...(filters.assemblyId === undefined ? {} : { assemblyId: filters.assemblyId }),
      ...(filters.electionId === undefined ? {} : { electionId: filters.electionId }),
    },
    orderBy: { opensAt: 'desc' },
    take: 200,
    select: {
      id: true,
      publicId: true,
      title: true,
      context: true,
      method: true,
      status: true,
      opensAt: true,
      closesAt: true,
      talliedAt: true,
      options: true,
      results: true,
      credentialSalt: true,
      assemblyId: true,
      agendaItemId: true,
    },
  });

  return ok(
    filas.map((fila) => {
      const opciones = voteOptionSchema.array().safeParse(fila.options);
      return {
        id: fila.id,
        publicId: fila.publicId,
        title: fila.title,
        context: fila.context,
        method: fila.method,
        status: fila.status,
        opensAt: fila.opensAt,
        closesAt: fila.closesAt,
        talliedAt: fila.talliedAt,
        options: opciones.success ? opciones.data : [],
        results: comoResultado(fila.results),
        keyDestroyed: fila.credentialSalt === null,
        assemblyId: fila.assemblyId,
        agendaItemId: fila.agendaItemId,
      };
    }),
  );
}
