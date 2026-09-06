'use server';

import { revalidatePath } from 'next/cache';
import {
  addProposal,
  advanceBargainingFile,
  assignBargainingCommissionMember,
  openBargainingFile,
  openConsultation,
} from '@/modules/bargaining';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';
import type { AppError } from '@/platform/errors/app-error';

/** Actos de negociación colectiva. */

export interface BargainingFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(resultado: { error: AppError }): BargainingFormState {
  return {
    status: 'error',
    message: resultado.error.message,
    ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
  };
}

function opcional(valor: string): string | null {
  return valor === '' ? null : valor;
}

export async function openFileAction(
  _previous: BargainingFormState,
  formData: FormData,
): Promise<BargainingFormState> {
  const actor = await currentActor();

  const resultado = await openBargainingFile(actor, {
    kind: textField(formData, 'kind') as
      | 'COLLECTIVE_AGREEMENT_NEGOTIATION'
      | 'CONTRACT_REVIEW'
      | 'WAGE_REVIEW'
      | 'COLLECTIVE_DISPUTE'
      | 'STRIKE_PROCEDURE',
    territorialUnitId: textField(formData, 'territorialUnitId'),
    counterpartOrganizationId: opcional(textField(formData, 'counterpartOrganizationId')),
    enablingResolutionId: opcional(textField(formData, 'enablingResolutionId')),
    authorityCaseNumber: opcional(textField(formData, 'authorityCaseNumber')),
    reason: textField(formData, 'reason'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/negociacion');
  return { status: 'ok', message: `Expediente ${resultado.data.folio} abierto.` };
}

export async function assignBargainingCommissionAction(
  _previous: BargainingFormState,
  formData: FormData,
): Promise<BargainingFormState> {
  const actor = await currentActor();
  const cargo = textField(formData, 'officeTermId');

  const resultado = await assignBargainingCommissionMember(actor, {
    fileId: textField(formData, 'fileId'),
    personId: textField(formData, 'personId'),
    officeTermId: cargo === '' ? null : cargo,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/negociacion');
  return { status: 'ok', message: `La comisión negociadora tiene ${resultado.data.members} integrante(s).` };
}

export async function addProposalAction(
  _previous: BargainingFormState,
  formData: FormData,
): Promise<BargainingFormState> {
  const actor = await currentActor();

  const resultado = await addProposal(actor, {
    fileId: textField(formData, 'fileId'),
    summary: textField(formData, 'summary'),
    templateCode: textField(formData, 'templateCode'),
    text: textField(formData, 'text'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/negociacion');
  return {
    status: 'ok',
    message: `Propuesta versión ${resultado.data.version} registrada, con documento ${resultado.data.folio}.`,
  };
}

export async function openConsultationAction(
  _previous: BargainingFormState,
  formData: FormData,
): Promise<BargainingFormState> {
  const actor = await currentActor();

  const resultado = await openConsultation(actor, {
    fileId: textField(formData, 'fileId'),
    title: textField(formData, 'title'),
    opensAt: textField(formData, 'opensAt'),
    closesAt: textField(formData, 'closesAt'),
    reason: textField(formData, 'reason'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/negociacion');
  return {
    status: 'ok',
    message: `Consulta abierta sobre ${resultado.data.rosterEntries} agremiados afectados. Huella del padrón ${resultado.data.rosterHash.slice(0, 16)}…`,
  };
}

export async function advanceFileAction(
  _previous: BargainingFormState,
  formData: FormData,
): Promise<BargainingFormState> {
  const actor = await currentActor();

  const resultado = await advanceBargainingFile(actor, {
    fileId: textField(formData, 'fileId'),
    to: textField(formData, 'to') as 'NEGOTIATION',
    reason: textField(formData, 'reason'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/negociacion');
  return { status: 'ok', message: `El expediente pasa a «${resultado.data.status}».` };
}
