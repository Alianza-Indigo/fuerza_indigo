'use server';

import { revalidatePath } from 'next/cache';
import { addAgendaItem, conveneAssembly, issueCall } from '@/modules/assembly';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/** Actos de convocatoria y orden del día. */

export interface AssemblyFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function conveneAssemblyAction(
  _previous: AssemblyFormState,
  formData: FormData,
): Promise<AssemblyFormState> {
  const actor = await currentActor();
  const lugar = textField(formData, 'venue');
  const cargo = textField(formData, 'convenedByOfficeTermId');

  const resultado = await conveneAssembly(actor, {
    unionBodyId: textField(formData, 'unionBodyId'),
    territorialUnitId: textField(formData, 'territorialUnitId'),
    type: textField(formData, 'type') as 'ORDINARY' | 'EXTRAORDINARY' | 'SECTIONAL',
    modality: textField(formData, 'modality') as 'IN_PERSON' | 'REMOTE' | 'HYBRID',
    venue: lugar === '' ? null : lugar,
    scheduledAt: textField(formData, 'scheduledAt'),
    convenedByOfficeTermId: cargo === '' ? null : cargo,
    convenedByPetition: formData.get('convenedByPetition') !== null,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: 'Asamblea registrada. Añade el orden del día y emite la convocatoria.',
  };
}

export async function addAgendaItemAction(
  _previous: AssemblyFormState,
  formData: FormData,
): Promise<AssemblyFormState> {
  const actor = await currentActor();

  const resultado = await addAgendaItem(actor, {
    assemblyId: textField(formData, 'assemblyId'),
    title: textField(formData, 'title'),
    description: textField(formData, 'description'),
    kind: textField(formData, 'kind') as
      | 'INFORMATIVE'
      | 'DELIBERATIVE'
      | 'ELECTIVE'
      | 'STATUTE_REFORM'
      | 'FINANCIAL_REPORT'
      | 'DISSOLUTION',
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/asambleas');
  return { status: 'ok', message: `Punto ${resultado.data.position} añadido al orden del día.` };
}

export async function issueCallAction(
  _previous: AssemblyFormState,
  formData: FormData,
): Promise<AssemblyFormState> {
  const actor = await currentActor();

  const resultado = await issueCall(actor, {
    assemblyId: textField(formData, 'assemblyId'),
    ordinal: textField(formData, 'ordinal') as 'FIRST' | 'SECOND',
    publishedChannels: formData
      .getAll('publishedChannels')
      .filter((valor): valor is string => typeof valor === 'string' && valor !== ''),
    templateCode: textField(formData, 'templateCode'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/asambleas');
  return {
    status: 'ok',
    message: `Convocatoria emitida con ${resultado.data.noticeDays} días de anticipación. Folio ${resultado.data.folio}.`,
  };
}
