'use server';

import { revalidatePath } from 'next/cache';
import {
  advanceElection,
  assignCommissionMember,
  createElection,
  decideSlate,
  exportElectionEvidence,
  issueElectionCall,
  openIncident,
  publishElectoralRoll,
  registerSlate,
  resolveIncident,
} from '@/modules/election';
import { freezeElectionRoster } from '@/modules/assembly';
import {
  certifyVoteProcess,
  closeVoteProcess,
  issueVoteCredentials,
  scheduleVoteProcess,
  tallyVoteProcess,
  type IssuedVoteCredential,
} from '@/modules/voting';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';
import type { AppError } from '@/platform/errors/app-error';

/** Actos del proceso electoral. */

export interface ElectionFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly warnings?: readonly { codigo: string; mensaje: string }[];
  readonly credentials?: readonly IssuedVoteCredential[];
  /** Expediente serializado, para copiarlo o guardarlo. */
  readonly evidence?: string;
}

function fallo(resultado: { error: AppError }): ElectionFormState {
  return {
    status: 'error',
    message: resultado.error.message,
    ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
  };
}

export async function createElectionAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();

  const codigos = formData
    .getAll('etapaCode')
    .filter((valor): valor is string => typeof valor === 'string');
  const fechas = formData
    .getAll('etapaFecha')
    .filter((valor): valor is string => typeof valor === 'string');

  const ETIQUETAS: Record<string, string> = {
    CALL: 'Convocatoria',
    REGISTRATION: 'Registro de planillas',
    REVIEW: 'Revisión de requisitos',
    CAMPAIGN: 'Campaña',
    VOTING: 'Jornada de votación',
    TALLY: 'Escrutinio',
    RESULTS: 'Declaración de resultados',
    CHALLENGES: 'Impugnaciones',
  };

  const calendar = codigos
    .map((code, indice) => ({ code, label: ETIQUETAS[code] ?? code, startsOn: fechas[indice] ?? '' }))
    .filter((etapa) => etapa.startsOn !== '');

  const resultado = await createElection(actor, {
    unionBodyId: textField(formData, 'unionBodyId'),
    territorialUnitId: textField(formData, 'territorialUnitId'),
    name: textField(formData, 'name'),
    calendar: calendar as { code: 'CALL'; label: string; startsOn: string }[],
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return { status: 'ok', message: 'Proceso electoral registrado. Integra la Comisión Electoral antes de convocar.' };
}

export async function assignCommissionAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const cargo = textField(formData, 'officeTermId');

  const resultado = await assignCommissionMember(actor, {
    electionId: textField(formData, 'electionId'),
    personId: textField(formData, 'personId'),
    officeTermId: cargo === '' ? null : cargo,
    noCandidacyDeclared: formData.get('noCandidacyDeclared') !== null,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return { status: 'ok', message: `Integrada. La comisión tiene ${resultado.data.members} integrante(s).` };
}

export async function issueElectionCallAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await issueElectionCall(actor, {
    electionId: textField(formData, 'electionId'),
    templateCode: textField(formData, 'templateCode'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return {
    status: 'ok',
    message: `Convocatoria emitida con folio ${resultado.data.folio}, ${resultado.data.noticeDays} días antes de la jornada.`,
  };
}

export async function advanceElectionAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await advanceElection(actor, {
    electionId: textField(formData, 'electionId'),
    to: textField(formData, 'to') as 'REGISTRATION_OPEN',
    reason: textField(formData, 'reason'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return { status: 'ok', message: `El proceso pasa a «${resultado.data.status}».` };
}

export async function freezeElectionRosterAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await freezeElectionRoster(actor, { electionId: textField(formData, 'electionId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return {
    status: 'ok',
    message: `Padrón electoral congelado: ${resultado.data.entryCount} personas, ${resultado.data.withVote} electoras. Huella ${resultado.data.hash.slice(0, 16)}…`,
  };
}

export async function publishRollAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await publishElectoralRoll(actor, { electionId: textField(formData, 'electionId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return {
    status: 'ok',
    message: `Padrón publicado con ${resultado.data.entryCount} entradas. Queda abierto el plazo de impugnación.`,
  };
}

export async function registerSlateAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();

  const personas = formData.getAll('memberPersonId').filter((valor): valor is string => typeof valor === 'string');
  const cargos = formData.getAll('memberOfficeId').filter((valor): valor is string => typeof valor === 'string');
  const suplencias = formData.getAll('memberSubstitute').filter((valor): valor is string => typeof valor === 'string');

  const members = personas
    .map((personId, indice) => ({
      personId,
      officeDefinitionId: cargos[indice] ?? '',
      position: indice + 1,
      isSubstitute: suplencias[indice] === 'si',
    }))
    .filter((integrante) => integrante.personId !== '' && integrante.officeDefinitionId !== '');

  const resultado = await registerSlate(actor, {
    electionId: textField(formData, 'electionId'),
    name: textField(formData, 'name'),
    members,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return {
    status: 'ok',
    message:
      resultado.data.warnings.length === 0
        ? 'Planilla registrada sin advertencias.'
        : 'Planilla registrada. Quedan estas advertencias, que la Comisión Electoral verá al revisarla:',
    warnings: resultado.data.warnings.map((alerta) => ({ codigo: alerta.codigo, mensaje: alerta.mensaje })),
  };
}

export async function decideSlateAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const motivo = textField(formData, 'rejectionReason');

  const resultado = await decideSlate(actor, {
    slateId: textField(formData, 'slateId'),
    decision: textField(formData, 'decision') as 'VALIDATED' | 'REJECTED',
    rejectionReason: motivo === '' ? null : motivo,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return {
    status: 'ok',
    message: resultado.data.status === 'VALIDATED' ? 'Planilla validada.' : 'Planilla rechazada, con su motivo.',
  };
}

export async function openIncidentAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();

  const archivo = formData.get('evidence');
  const evidencia =
    archivo instanceof File && archivo.size > 0
      ? {
          fileName: archivo.name,
          mimeType: archivo.type,
          content: new Uint8Array(await archivo.arrayBuffer()),
        }
      : null;

  const resultado = await openIncident(actor, {
    electionId: textField(formData, 'electionId'),
    kind: textField(formData, 'kind') as 'PROCEDURAL' | 'ELIGIBILITY' | 'TECHNICAL' | 'CONDUCT' | 'CHALLENGE',
    description: textField(formData, 'description'),
    evidence: evidencia,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return { status: 'ok', message: 'Incidencia registrada. La Comisión Electoral la resolverá por escrito.' };
}

export async function resolveIncidentAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await resolveIncident(actor, {
    incidentId: textField(formData, 'incidentId'),
    status: textField(formData, 'status') as 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED' | 'ESCALATED',
    resolution: textField(formData, 'resolution'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return { status: 'ok', message: 'Incidencia actualizada.' };
}

export async function scheduleElectionVoteAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();

  const codigos = formData.getAll('opcionCodigo').filter((valor): valor is string => typeof valor === 'string');
  const etiquetas = formData.getAll('opcionEtiqueta').filter((valor): valor is string => typeof valor === 'string');

  const options = codigos
    .map((code, indice) => ({ code, label: etiquetas[indice] ?? code }))
    .filter((opcion) => opcion.code !== '' && opcion.label !== '');

  const resultado = await scheduleVoteProcess(actor, {
    context: 'ELECTION',
    assemblyId: null,
    agendaItemId: null,
    electionId: textField(formData, 'electionId'),
    bargainingFileId: null,
    title: textField(formData, 'title'),
    method: 'SECRET',
    options,
    rosterSnapshotId: textField(formData, 'rosterSnapshotId'),
    opensAt: textField(formData, 'opensAt'),
    closesAt: textField(formData, 'closesAt'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return { status: 'ok', message: 'Jornada programada. Emite las credenciales para abrirla.' };
}

export async function issueElectionCredentialsAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await issueVoteCredentials(actor, { voteProcessId: textField(formData, 'voteProcessId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return {
    status: 'ok',
    message: `${resultado.data.issued.length} credenciales emitidas. Repártelas ahora: no se guardan.`,
    credentials: resultado.data.issued,
  };
}

export async function closeElectionVoteAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await closeVoteProcess(actor, { voteProcessId: textField(formData, 'voteProcessId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return { status: 'ok', message: 'Jornada cerrada.' };
}

export async function tallyElectionVoteAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await tallyVoteProcess(actor, { voteProcessId: textField(formData, 'voteProcessId') });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  const conteo = resultado.data.byOption.map((opcion) => `${opcion.label}: ${opcion.votes}`).join(' · ');
  return { status: 'ok', message: `Escrutinio: ${conteo}. Abstención ${resultado.data.abstained}.` };
}

export async function certifyElectionVoteAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await certifyVoteProcess(actor, {
    voteProcessId: textField(formData, 'voteProcessId'),
    templateCode: textField(formData, 'templateCode'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/elecciones');
  return {
    status: 'ok',
    message: `Acta de resultados con folio ${resultado.data.folio}. La clave del proceso quedó destruida.`,
  };
}

export async function exportEvidenceAction(
  _previous: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  const actor = await currentActor();
  const resultado = await exportElectionEvidence(actor, {
    electionId: textField(formData, 'electionId'),
    reason: textField(formData, 'reason'),
  });
  if (!resultado.ok) return fallo(resultado);

  return {
    status: 'ok',
    message: `Expediente reunido. Huella ${resultado.data.hash}.`,
    evidence: JSON.stringify(resultado.data, null, 2),
  };
}
