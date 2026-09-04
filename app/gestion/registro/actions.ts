'use server';

import { revalidatePath } from 'next/cache';
import { mergePeople, registerPerson, updatePerson } from '@/modules/identity';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones del registro maestro de persona (PRD §3.1).
 *
 * El alta se detiene cuando encuentra coincidencias y devuelve `conflicto`. La
 * pantalla muestra a quién se parece y ofrece confirmar que es otra persona:
 * esa confirmación viaja como un campo del formulario y queda en la bitácora.
 */

export interface RegistroFormState {
  readonly status: 'idle' | 'error' | 'ok' | 'conflicto';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly personId?: string;
  /**
   * Lo que la persona escribió, devuelto tal cual cuando algo falla.
   *
   * React reinicia los campos de un formulario al terminar una acción, así que
   * sin esto el aviso de posible duplicidad llegaba con el formulario en blanco:
   * quien acababa de teclear quince campos los perdía justo en el momento en que
   * se le pedía revisarlos y volver a enviar. Un aviso que castiga leerlo es un
   * aviso que la gente aprende a esquivar (defecto `D-F4-005`, PRD §5.3).
   */
  readonly values?: Record<string, string>;
}

/** Campos del formulario que se devuelven cuando hay que volver a mostrarlo. */
const CAMPOS = [
  'givenName',
  'middleName',
  'familyName',
  'secondFamilyName',
  'preferredName',
  'birthDate',
  'genderIdentity',
  'nationality',
  'primaryEmail',
  'primaryPhone',
  'alternateContact',
  'addressLine',
  'postalCode',
  'stateCode',
  'municipalityCode',
  'territorialUnitId',
] as const;

function loEscrito(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const campo of CAMPOS) valores[campo] = textField(formData, campo);
  return valores;
}

function opcional(formData: FormData, nombre: string): Record<string, string> {
  const valor = textField(formData, nombre);
  return valor === '' ? {} : { [nombre]: valor };
}

function camposDeIdentidad(formData: FormData) {
  return {
    givenName: textField(formData, 'givenName'),
    familyName: textField(formData, 'familyName'),
    genderIdentity: (textField(formData, 'genderIdentity') || 'UNDISCLOSED') as
      | 'WOMAN'
      | 'MAN'
      | 'NON_BINARY'
      | 'OTHER'
      | 'UNDISCLOSED',
    ...opcional(formData, 'middleName'),
    ...opcional(formData, 'secondFamilyName'),
    ...opcional(formData, 'preferredName'),
    ...opcional(formData, 'birthDate'),
    ...opcional(formData, 'nationality'),
    ...opcional(formData, 'primaryEmail'),
    ...opcional(formData, 'primaryPhone'),
    ...opcional(formData, 'alternateContact'),
    ...opcional(formData, 'addressLine'),
    ...opcional(formData, 'postalCode'),
    ...opcional(formData, 'stateCode'),
    ...opcional(formData, 'municipalityCode'),
    ...opcional(formData, 'territorialUnitId'),
  };
}

export async function registerPersonAction(
  _previous: RegistroFormState,
  formData: FormData,
): Promise<RegistroFormState> {
  const actor = await currentActor();
  const resultado = await registerPerson(actor, {
    ...camposDeIdentidad(formData),
    confirmedDistinct: textField(formData, 'confirmedDistinct') === 'si',
  });

  if (!resultado.ok) {
    return {
      status: resultado.error.code === 'CONFLICT' ? 'conflicto' : 'error',
      message: resultado.error.message,
      values: loEscrito(formData),
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/registro');
  return {
    status: 'ok',
    message: `Registro creado con el identificador ${resultado.data.publicId}.`,
    personId: resultado.data.personId,
  };
}

export async function updatePersonAction(
  _previous: RegistroFormState,
  formData: FormData,
): Promise<RegistroFormState> {
  const actor = await currentActor();
  const personId = textField(formData, 'personId');
  const resultado = await updatePerson(actor, {
    ...camposDeIdentidad(formData),
    personId,
    rowVersion: textField(formData, 'rowVersion'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: loEscrito(formData),
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/gestion/registro/${personId}`);
  return { status: 'ok', message: 'Datos actualizados.', personId };
}

export async function mergePeopleAction(
  _previous: RegistroFormState,
  formData: FormData,
): Promise<RegistroFormState> {
  const actor = await currentActor();
  const keepPersonId = textField(formData, 'keepPersonId');
  const resultado = await mergePeople(actor, {
    keepPersonId,
    mergePersonId: textField(formData, 'mergePersonId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  const movidas = Object.values(resultado.data.movedRows).reduce((suma, cuantas) => suma + cuantas, 0);
  revalidatePath(`/gestion/registro/${keepPersonId}`);
  return {
    status: 'ok',
    message:
      movidas === 0
        ? 'Registros fusionados. El duplicado no tenía nada que trasladar.'
        : `Registros fusionados. Se trasladaron ${movidas} elementos al registro que se conserva.` +
          (resultado.data.accountDisabled ? ' La cuenta del duplicado quedó deshabilitada.' : ''),
    personId: keepPersonId,
  };
}
