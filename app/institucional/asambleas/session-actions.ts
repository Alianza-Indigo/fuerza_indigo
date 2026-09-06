'use server';

import { revalidatePath } from 'next/cache';
import {
  attachAgendaDocument,
  declareQuorum,
  freezeRoster,
  publishMinutes,
  recordResolution,
  registerAttendance,
  updateFollowUp,
} from '@/modules/assembly';
import { signDocument } from '@/modules/documents';
import {
  certifyVoteProcess,
  closeVoteProcess,
  issueVoteCredentials,
  scheduleVoteProcess,
  tallyVoteProcess,
  type IssuedVoteCredential,
} from '@/modules/voting';
import { currentActor } from '@/platform/http/request-context';
import { withReason } from '@/platform/kernel/actor-context';
import { textField } from '@/platform/http/form-fields';
import { uploadFile } from '@/platform/files';
import type { AppError } from '@/platform/errors/app-error';

/** Actos de la sesión: padrón, asistencia, quórum, votación, acuerdos y acta. */

export interface SessionFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  /**
   * Credenciales de voto recién emitidas. Viajan **una sola vez**: el servidor
   * no las guarda, así que esta respuesta es la única oportunidad de
   * repartirlas (ADR-0012).
   */
  readonly credentials?: readonly IssuedVoteCredential[];
  readonly verificationCodes?: readonly string[];
}

function fallo(resultado: { error: AppError }): SessionFormState {
  return {
    status: 'error',
    message: resultado.error.message,
    ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
  };
}

export async function freezeRosterAction(_previous: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const actor = await currentActor();
  const resultado = await freezeRoster(actor, { assemblyId: textField(formData, 'assemblyId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `Padrón congelado: ${resultado.data.entryCount} personas, ${resultado.data.withVote} con derecho a voto. Huella ${resultado.data.hash.slice(0, 16)}…`,
  };
}

export async function registerAttendanceAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const actor = await currentActor();
  const membresia = textField(formData, 'membershipId');
  const credencial = textField(formData, 'credentialToken');

  const resultado = await registerAttendance(actor, {
    assemblyId: textField(formData, 'assemblyId'),
    method: textField(formData, 'method') as 'QR_CREDENTIAL' | 'MANUAL' | 'REMOTE_SESSION',
    membershipId: membresia === '' ? null : membresia,
    credentialToken: credencial === '' ? null : credencial,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `${resultado.data.personName} (${resultado.data.memberNumber}) queda registrada${resultado.data.hasVote ? ' con derecho a voto' : ' con voz, sin voto'}. Presentes: ${resultado.data.present}.`,
  };
}

export async function declareQuorumAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const ordinal = textField(formData, 'ordinal') as 'FIRST' | 'SECOND';
  // Declarar quórum es un acto crítico y el motor exige motivo: el motivo de
  // este acto es la convocatoria con la que se instala la sesión, y así queda
  // asentado en la bitácora.
  const actor = withReason(
    await currentActor(),
    `instalación de la sesión con la ${ordinal === 'FIRST' ? 'primera' : 'segunda'} convocatoria`,
  );
  const resultado = await declareQuorum(actor, {
    assemblyId: textField(formData, 'assemblyId'),
    ordinal,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `Quórum declarado: ${resultado.data.present} de ${resultado.data.base}. La sesión queda instalada.`,
  };
}

export async function scheduleVoteAction(_previous: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const actor = await currentActor();

  const etiquetas = formData
    .getAll('optionLabels')
    .filter((valor): valor is string => typeof valor === 'string' && valor.trim() !== '');

  const resultado = await scheduleVoteProcess(actor, {
    context: 'ASSEMBLY_ITEM',
    assemblyId: textField(formData, 'assemblyId'),
    agendaItemId: textField(formData, 'agendaItemId'),
    electionId: null,
    bargainingFileId: null,
    title: textField(formData, 'title'),
    method: textField(formData, 'method') as 'SECRET' | 'OPEN_ROLL_CALL',
    // Las tres opciones de un acuerdo de asamblea son siempre las mismas, y sus
    // códigos son los que el asiento de la resolución sabe leer.
    options: [
      { code: 'A_FAVOR', label: etiquetas[0] ?? 'A favor' },
      { code: 'EN_CONTRA', label: etiquetas[1] ?? 'En contra' },
      { code: 'ABSTENCION', label: etiquetas[2] ?? 'Abstención' },
    ],
    rosterSnapshotId: textField(formData, 'rosterSnapshotId'),
    opensAt: textField(formData, 'opensAt'),
    closesAt: textField(formData, 'closesAt'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return { status: 'ok', message: 'Votación programada. Emite las credenciales para abrirla.' };
}

export async function issueCredentialsAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const actor = await currentActor();
  const resultado = await issueVoteCredentials(actor, { voteProcessId: textField(formData, 'voteProcessId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `${resultado.data.issued.length} credenciales emitidas. Repártelas ahora: no se guardan y no se pueden volver a mostrar.`,
    credentials: resultado.data.issued,
  };
}

export async function closeVoteAction(_previous: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const actor = await currentActor();
  const resultado = await closeVoteProcess(actor, { voteProcessId: textField(formData, 'voteProcessId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return { status: 'ok', message: 'Votación cerrada. Ya no admite boletas.' };
}

export async function tallyVoteAction(_previous: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const actor = await currentActor();
  const resultado = await tallyVoteProcess(actor, { voteProcessId: textField(formData, 'voteProcessId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  const conteo = resultado.data.byOption.map((opcion) => `${opcion.label}: ${opcion.votes}`).join(' · ');
  return {
    status: 'ok',
    message: `Escrutinio: ${conteo}. Blancos ${resultado.data.blank}, nulos ${resultado.data.invalid}. Abstención ${resultado.data.abstained}.`,
    verificationCodes: resultado.data.verificationCodes,
  };
}

export async function certifyVoteAction(_previous: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const actor = withReason(await currentActor(), 'certificación del escrutinio y destrucción de la clave del proceso');
  const resultado = await certifyVoteProcess(actor, {
    voteProcessId: textField(formData, 'voteProcessId'),
    templateCode: textField(formData, 'templateCode'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `Resultados certificados con folio ${resultado.data.folio}. La clave del proceso quedó destruida: ya no pueden fabricarse credenciales para esta votación.`,
  };
}

export async function recordResolutionAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const actor = await currentActor();
  const proceso = textField(formData, 'voteProcessId');
  const vigencia = textField(formData, 'effectiveFrom');
  const responsable = textField(formData, 'followUpOwnerId');
  const plazo = textField(formData, 'followUpDueOn');

  const resultado = await recordResolution(actor, {
    agendaItemId: textField(formData, 'agendaItemId'),
    voteProcessId: proceso === '' ? null : proceso,
    text: textField(formData, 'text'),
    effectiveFrom: vigencia === '' ? null : vigencia,
    publicationLevel: textField(formData, 'publicationLevel') as 'RESERVED' | 'MEMBERS_ONLY' | 'PUBLIC_REDACTED',
    followUpOwnerId: responsable === '' ? null : responsable,
    followUpDueOn: plazo === '' ? null : plazo,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `Resolución ${resultado.data.number} asentada como ${resultado.data.outcome === 'APPROVED' ? 'aprobada' : 'rechazada'} (a favor ${resultado.data.votesFor}, en contra ${resultado.data.votesAgainst}).`,
  };
}

export async function publishMinutesAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const actor = await currentActor();
  const resultado = await publishMinutes(actor, {
    assemblyId: textField(formData, 'assemblyId'),
    templateCode: textField(formData, 'templateCode'),
    publicationLevel: textField(formData, 'publicationLevel') as 'RESERVED' | 'MEMBERS_ONLY' | 'PUBLIC_REDACTED',
    narrative: textField(formData, 'narrative'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `Acta publicada con folio ${resultado.data.folio}, con ${resultado.data.resolutions} resolución(es).`,
  };
}

export async function updateFollowUpAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const actor = await currentActor();

  // El archivo llega en el mismo envío. Si no lo hay, el caso de uso decide qué
  // hacer: para «cumplido» lo exige, para el resto no.
  const archivo = formData.get('evidence');
  const evidencia =
    archivo instanceof File && archivo.size > 0
      ? {
          fileName: archivo.name,
          mimeType: archivo.type,
          content: new Uint8Array(await archivo.arrayBuffer()),
        }
      : null;

  const resultado = await updateFollowUp(actor, {
    resolutionId: textField(formData, 'resolutionId'),
    status: textField(formData, 'status') as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE',
    note: textField(formData, 'note'),
    evidence: evidencia,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/acuerdos');
  return { status: 'ok', message: 'Seguimiento actualizado.' };
}

export async function attachAgendaDocumentAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const actor = await currentActor();

  const archivo = formData.get('file');
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { status: 'error', message: 'Elige el documento que se adjunta.' };
  }

  const resultado = await attachAgendaDocument(actor, {
    agendaItemId: textField(formData, 'agendaItemId'),
    file: {
      fileName: archivo.name,
      mimeType: archivo.type,
      content: new Uint8Array(await archivo.arrayBuffer()),
    },
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return { status: 'ok', message: 'Documento previo adjunto al punto.' };
}

export async function signDocumentAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const actor = await currentActor();

  const archivo = formData.get('signatureFile');
  const cargo = textField(formData, 'signerOfficeTermId');

  // La firma autógrafa escaneada se sube como cualquier otro archivo del acto;
  // la electrónica simple y la copia certificada no llevan archivo.
  let fileObjectId: string | null = null;
  if (archivo instanceof File && archivo.size > 0) {
    const guardado = await uploadFile(actor, {
      legalEntityId: textField(formData, 'legalEntityId'),
      classification: 'INTERNAL',
      contextKind: 'GOVERNANCE',
      contextId: textField(formData, 'documentId'),
      originalFileName: archivo.name,
      mimeType: archivo.type,
      content: new Uint8Array(await archivo.arrayBuffer()),
    });
    if (!guardado.ok) return fallo(guardado);
    fileObjectId = guardado.data.fileObjectId;
  }

  const resultado = await signDocument(actor, {
    documentId: textField(formData, 'documentId'),
    signerOfficeTermId: cargo === '' ? null : cargo,
    signatureKind: textField(formData, 'signatureKind') as
      | 'HANDWRITTEN_SCANNED'
      | 'ELECTRONIC_SIMPLE'
      | 'CERTIFIED_COPY',
    fileObjectId,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `Documento firmado. Queda constancia de la huella firmada: ${resultado.data.documentSha256.slice(0, 16)}…`,
  };
}
