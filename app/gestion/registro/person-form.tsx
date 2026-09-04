'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Field,
  Notice,
  Select,
  SubmitButton,
  SuccessNotice,
  type Option,
} from '@/design-system/primitives';
import { registerPersonAction, updatePersonAction, type RegistroFormState } from './actions';

const INICIAL: RegistroFormState = { status: 'idle' };

const GENEROS: readonly Option[] = [
  { value: 'WOMAN', label: 'Mujer' },
  { value: 'MAN', label: 'Hombre' },
  { value: 'NON_BINARY', label: 'No binaria' },
  { value: 'OTHER', label: 'Otra' },
  { value: 'UNDISCLOSED', label: 'Prefiere no decirlo' },
];

export interface ValoresDePersona {
  readonly personId: string;
  readonly rowVersion: number;
  readonly givenName: string;
  readonly middleName: string;
  readonly familyName: string;
  readonly secondFamilyName: string;
  readonly preferredName: string;
  readonly birthDate: string;
  readonly genderIdentity: string;
  readonly nationality: string;
  readonly primaryEmail: string;
  readonly primaryPhone: string;
  readonly alternateContact: string;
  readonly addressLine: string;
  readonly postalCode: string;
  readonly stateCode: string;
  readonly municipalityCode: string;
  readonly territorialUnitId: string;
}

/**
 * Alta y edición del registro maestro (PRD §3.1).
 *
 * Al dar de alta, si el sistema encuentra registros parecidos **no crea nada**:
 * lo dice y ofrece confirmar que es otra persona. La confirmación es una casilla
 * que solo aparece después de haber visto el aviso, y queda en la bitácora con
 * quién la marcó.
 */
export function PersonForm({
  territorios,
  valores,
}: {
  territorios: readonly Option[];
  valores?: ValoresDePersona | undefined;
}) {
  const editando = valores !== undefined;
  const [estado, accion, pendiente] = useActionState(
    editando ? updatePersonAction : registerPersonAction,
    INICIAL,
  );

  /**
   * Lo que se vuelve a pintar en cada campo.
   *
   * Primero lo que la persona acaba de escribir —React vacía el formulario al
   * terminar una acción, así que si no se devuelve se pierde—, y en su defecto
   * lo que había guardado.
   */
  const dato = (campo: keyof ValoresDePersona): string | undefined =>
    estado.values?.[campo] ?? (valores === undefined ? undefined : String(valores[campo]));

  /**
   * Fuerza el remontaje de los campos cuando cambia lo que hay que pintar.
   *
   * Un `defaultValue` solo se aplica al montar: cambiarlo después no repinta
   * nada. Sin esta clave, devolver lo escrito no serviría de nada y el
   * formulario seguiría apareciendo vacío tras el aviso.
   */
  const clave = estado.status === 'idle' ? 'inicial' : JSON.stringify(estado.values ?? {});

  return (
    <form action={accion} className="space-y-6">
      {editando && (
        <>
          <input type="hidden" name="personId" value={valores.personId} />
          <input type="hidden" name="rowVersion" value={valores.rowVersion} />
        </>
      )}

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Guardado'} />}
      {estado.status === 'conflicto' && (
        <Notice tone="warning" title={estado.message ?? 'Puede ser alguien que ya está registrado'}>
          <p>
            Búscala en el listado de arriba antes de seguir. Si de verdad es otra persona —dos hermanas con el
            mismo nombre, por ejemplo— marca la casilla del final y vuelve a guardar.
          </p>
        </Notice>
      )}

      <div key={clave} className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Identidad</legend>
        <Field name="givenName" label="Nombre" required defaultValue={dato('givenName')} errors={estado.fieldErrors?.['givenName']} />
        <Field name="middleName" label="Segundo nombre" hint="Opcional." defaultValue={dato('middleName')} errors={estado.fieldErrors?.['middleName']} />
        <Field name="familyName" label="Primer apellido" required defaultValue={dato('familyName')} errors={estado.fieldErrors?.['familyName']} />
        <Field name="secondFamilyName" label="Segundo apellido" hint="Opcional." defaultValue={dato('secondFamilyName')} errors={estado.fieldErrors?.['secondFamilyName']} />
        <Field
          name="preferredName"
          label="Nombre con el que prefiere que la llamen"
          hint="Opcional. Es el que usan las pantallas y los correos."
          defaultValue={dato('preferredName')}
          errors={estado.fieldErrors?.['preferredName']}
        />
        <Field
          name="birthDate"
          label="Fecha de nacimiento"
          type="date"
          hint="Opcional. Sirve para distinguir a dos personas con el mismo nombre."
          defaultValue={dato('birthDate')}
          errors={estado.fieldErrors?.['birthDate']}
        />
        <Select
          name="genderIdentity"
          label="Identidad de género"
          options={GENEROS}
          defaultValue={dato('genderIdentity') ?? 'UNDISCLOSED'}
          placeholder="Prefiere no decirlo"
          errors={estado.fieldErrors?.['genderIdentity']}
        />
        <Field name="nationality" label="Nacionalidad" hint="Opcional." defaultValue={dato('nationality')} errors={estado.fieldErrors?.['nationality']} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Contacto</legend>
        <Field name="primaryEmail" label="Correo electrónico" type="email" hint="Opcional. No crea una cuenta." defaultValue={dato('primaryEmail')} errors={estado.fieldErrors?.['primaryEmail']} />
        <Field name="primaryPhone" label="Teléfono" type="tel" hint="Opcional." defaultValue={dato('primaryPhone')} errors={estado.fieldErrors?.['primaryPhone']} />
        <Field name="alternateContact" label="Otro medio de contacto" hint="Opcional. Por ejemplo, el teléfono de un familiar." defaultValue={dato('alternateContact')} errors={estado.fieldErrors?.['alternateContact']} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Domicilio y territorio</legend>
        <Field name="addressLine" label="Domicilio" hint="Opcional." defaultValue={dato('addressLine')} errors={estado.fieldErrors?.['addressLine']} />
        <Field name="postalCode" label="Código postal" hint="Opcional." inputMode="numeric" defaultValue={dato('postalCode')} errors={estado.fieldErrors?.['postalCode']} />
        <Field name="stateCode" label="Clave de la entidad federativa" hint="Opcional." defaultValue={dato('stateCode')} errors={estado.fieldErrors?.['stateCode']} />
        <Field name="municipalityCode" label="Clave del municipio" hint="Opcional." defaultValue={dato('municipalityCode')} errors={estado.fieldErrors?.['municipalityCode']} />
        <Select
          name="territorialUnitId"
          label="Unidad territorial"
          hint="Opcional. Es el dato de la persona, no su alcance de trabajo."
          options={territorios}
          defaultValue={dato('territorialUnitId') ?? ''}
          placeholder="Sin especificar"
          errors={estado.fieldErrors?.['territorialUnitId']}
        />
      </fieldset>
      </div>

      {!editando && estado.status === 'conflicto' && (
        <label className="flex items-start gap-3 rounded-lg border border-[var(--color-line-strong)] p-3">
          <input type="checkbox" name="confirmedDistinct" value="si" className="mt-1 size-5" />
          <span className="text-sm">
            He revisado las coincidencias y confirmo que se trata de <strong>otra persona</strong>. Entiendo que
            queda registrado quién lo confirmó.
          </span>
        </label>
      )}

      <SubmitButton>{pendiente ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar persona'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Guardando' : ''}
      </p>
    </form>
  );
}
