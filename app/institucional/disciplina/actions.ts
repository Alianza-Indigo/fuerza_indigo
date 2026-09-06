'use server';

import { revalidatePath } from 'next/cache';
import {
  assessEvidence,
  fileAppeal,
  issueDisciplinaryDecision,
  notifyDisciplinaryCase,
  offerEvidence,
  openDisciplinaryCase,
  recordHearing,
  resolveAppeal,
} from '@/modules/discipline';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';
import type { AppError } from '@/platform/errors/app-error';

/** Actos del procedimiento disciplinario. */

export interface DisciplineFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(resultado: { error: AppError }): DisciplineFormState {
  return {
    status: 'error',
    message: resultado.error.message,
    ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
  };
}

export async function openCaseAction(
  _previous: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const actor = await currentActor();

  const personas = formData.getAll('instructorPersonId').filter((valor): valor is string => typeof valor === 'string');
  const papeles = formData.getAll('instructorRole').filter((valor): valor is string => typeof valor === 'string');
  const declaraciones = formData
    .getAll('instructorStatement')
    .filter((valor): valor is string => typeof valor === 'string');
  const conflictos = formData.getAll('instructorConflict').filter((valor): valor is string => typeof valor === 'string');

  const checks = personas
    .map((personId, indice) => ({
      personId,
      role: papeles[indice] ?? '',
      statement: declaraciones[indice] ?? '',
      hasConflict: conflictos[indice] === 'si',
    }))
    .filter((declaracion) => declaracion.personId !== '' && declaracion.role !== '');

  const resultado = await openDisciplinaryCase(actor, {
    membershipId: textField(formData, 'membershipId'),
    instructingBodyId: textField(formData, 'instructingBodyId'),
    allegedFacts: textField(formData, 'allegedFacts'),
    conflictOfInterestChecks: checks,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/disciplina');
  return { status: 'ok', message: `Expediente ${resultado.data.folio} abierto.` };
}

export async function notifyCaseAction(
  _previous: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const actor = await currentActor();

  const resultado = await notifyDisciplinaryCase(actor, {
    caseId: textField(formData, 'caseId'),
    hearingAt: textField(formData, 'hearingAt'),
    note: textField(formData, 'note'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/disciplina');
  return {
    status: 'ok',
    message: `Notificada y citada a audiencia. El estatuto da ${resultado.data.answerDays} día(s) para contestar y ofrecer pruebas; el acceso al expediente quedó abierto.`,
  };
}

export async function recordHearingAction(
  _previous: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const actor = await currentActor();

  const resultado = await recordHearing(actor, {
    caseId: textField(formData, 'caseId'),
    outcome: textField(formData, 'outcome') as 'HELD' | 'WAIVED',
    note: textField(formData, 'note'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/disciplina');
  return { status: 'ok', message: 'Audiencia asentada.' };
}

export async function offerEvidenceAction(
  _previous: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const actor = await currentActor();

  const archivo = formData.get('file');
  const adjunto =
    archivo instanceof File && archivo.size > 0
      ? {
          fileName: archivo.name,
          mimeType: archivo.type,
          content: new Uint8Array(await archivo.arrayBuffer()),
        }
      : null;

  const resultado = await offerEvidence(actor, {
    caseId: textField(formData, 'caseId'),
    offeredBy: textField(formData, 'offeredBy') as 'INSTRUCTING_BODY' | 'MEMBER' | 'THIRD_PARTY',
    kind: textField(formData, 'kind') as 'DOCUMENT' | 'TESTIMONY' | 'RECORD' | 'OTHER',
    description: textField(formData, 'description'),
    file: adjunto,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/disciplina');
  return { status: 'ok', message: 'Prueba ofrecida. Queda por valorar.' };
}

export async function assessEvidenceAction(
  _previous: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const actor = await currentActor();

  const resultado = await assessEvidence(actor, {
    evidenceId: textField(formData, 'evidenceId'),
    admitted: textField(formData, 'admitted') === 'si',
    admissionRationale: textField(formData, 'admissionRationale'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/disciplina');
  return { status: 'ok', message: resultado.data.admitted ? 'Prueba admitida.' : 'Prueba desechada, con su razón.' };
}

export async function issueDecisionAction(
  _previous: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const actor = await currentActor();
  const desde = textField(formData, 'sanctionStartsOn');
  const hasta = textField(formData, 'sanctionEndsOn');

  const resultado = await issueDisciplinaryDecision(actor, {
    caseId: textField(formData, 'caseId'),
    decidedByBodyId: textField(formData, 'decidedByBodyId'),
    outcome: textField(formData, 'outcome') as
      | 'NO_LIABILITY'
      | 'WARNING'
      | 'SUSPENSION_OF_RIGHTS'
      | 'EXPULSION'
      | 'OTHER_STATUTORY',
    rationale: textField(formData, 'rationale'),
    sanctionStartsOn: desde === '' ? null : desde,
    sanctionEndsOn: hasta === '' ? null : hasta,
    templateCode: textField(formData, 'templateCode'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/disciplina');
  const plazo = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' }).format(
    resultado.data.appealDeadlineAt,
  );
  return {
    status: 'ok',
    message: `Resolución dictada con documento ${resultado.data.folio}. El plazo para recurrir vence el ${plazo}.`,
  };
}

export async function fileAppealAction(
  _previous: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const actor = await currentActor();

  const resultado = await fileAppeal(actor, {
    decisionId: textField(formData, 'decisionId'),
    grounds: textField(formData, 'grounds'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/disciplina');
  return { status: 'ok', message: 'Recurso interpuesto.' };
}

export async function resolveAppealAction(
  _previous: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const actor = await currentActor();
  const asamblea = textField(formData, 'resolvedByAssemblyId');

  const resultado = await resolveAppeal(actor, {
    appealId: textField(formData, 'appealId'),
    status: textField(formData, 'status') as
      | 'ADMITTED'
      | 'INADMISSIBLE'
      | 'RESOLVED_CONFIRMED'
      | 'RESOLVED_MODIFIED'
      | 'RESOLVED_REVOKED',
    resolutionText: textField(formData, 'resolutionText'),
    resolvedByAssemblyId: asamblea === '' ? null : asamblea,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/disciplina');
  return {
    status: 'ok',
    message: resultado.data.rightsRestored
      ? 'Recurso resuelto: se revoca la resolución y los derechos quedan restituidos en este mismo acto.'
      : 'Recurso resuelto.',
  };
}
