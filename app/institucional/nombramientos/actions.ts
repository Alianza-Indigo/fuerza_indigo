'use server';

import { revalidatePath } from 'next/cache';
import { appointOffice, endOfficeTerm, grantPower, revokePower } from '@/modules/governance';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/** Actos sobre periodos de cargo y poderes. */

export interface TermFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function opcional(valor: string): string | null {
  return valor === '' ? null : valor;
}

export async function appointOfficeAction(_previous: TermFormState, formData: FormData): Promise<TermFormState> {
  const actor = await currentActor();

  const resultado = await appointOffice(actor, {
    officeDefinitionId: textField(formData, 'officeDefinitionId'),
    membershipId: textField(formData, 'membershipId'),
    territorialUnitId: opcional(textField(formData, 'territorialUnitId')),
    designationMethod: textField(formData, 'designationMethod') as
      | 'ELECTION'
      | 'ASSEMBLY_APPOINTMENT'
      | 'SUBSTITUTION'
      | 'INTERIM',
    electionId: opcional(textField(formData, 'electionId')),
    substitutedTermId: opcional(textField(formData, 'substitutedTermId')),
    startsOn: textField(formData, 'startsOn'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/nombramientos');
  const hasta = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' }).format(
    resultado.data.endsOn,
  );
  return {
    status: 'ok',
    message: `Nombramiento registrado. El periodo y su acceso terminan el ${hasta}, sin que nadie tenga que intervenir.`,
  };
}

export async function endOfficeTermAction(_previous: TermFormState, formData: FormData): Promise<TermFormState> {
  const actor = await currentActor();

  const resultado = await endOfficeTerm(actor, {
    officeTermId: textField(formData, 'officeTermId'),
    endedOn: textField(formData, 'endedOn'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/nombramientos');
  return {
    status: 'ok',
    message: 'Periodo concluido. Se retiró el acceso y se revocaron los poderes que salieron de ese cargo.',
  };
}

export async function grantPowerAction(_previous: TermFormState, formData: FormData): Promise<TermFormState> {
  const actor = await currentActor();

  const resultado = await grantPower(actor, {
    officeTermId: textField(formData, 'officeTermId'),
    granteePersonId: textField(formData, 'granteePersonId'),
    powerKind: textField(formData, 'powerKind') as
      | 'LEGAL_REPRESENTATION'
      | 'BANKING'
      | 'LABOR_AUTHORITY'
      | 'ADMINISTRATIVE'
      | 'SPECIAL',
    scope: textField(formData, 'scope'),
    notaryReference: opcional(textField(formData, 'notaryReference')),
    startsOn: textField(formData, 'startsOn'),
    endsOn: opcional(textField(formData, 'endsOn')),
    templateCode: textField(formData, 'templateCode'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/nombramientos');
  return { status: 'ok', message: `Poder otorgado. Documento probatorio con folio ${resultado.data.folio}.` };
}

export async function revokePowerAction(_previous: TermFormState, formData: FormData): Promise<TermFormState> {
  const actor = await currentActor();

  const resultado = await revokePower(actor, {
    powerGrantId: textField(formData, 'powerGrantId'),
    revokedOn: textField(formData, 'revokedOn'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/nombramientos');
  return { status: 'ok', message: 'Poder revocado. El registro conserva su historia.' };
}
