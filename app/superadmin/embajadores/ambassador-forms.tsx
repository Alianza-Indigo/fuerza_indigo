'use client';

import { useActionState } from 'react';

import {
  ErrorNotice,
  Field,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import type { IndigoAmbassadorView } from '@/modules/admin';
import {
  createAmbassadorAction,
  updateAmbassadorAction,
  type AmbassadorFormState,
} from './actions';

const INITIAL: AmbassadorFormState = { status: 'idle' };

export function CreateAmbassadorForm() {
  const [state, action, pending] = useActionState(createAmbassadorAction, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' && <ErrorNotice title={state.message ?? 'No se pudo crear el embajador'} />}
      {state.status === 'ok' && <SuccessNotice title={state.message ?? 'Embajador creado'} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="givenName" label="Nombre" required errors={errors['givenName']} />
        <Field name="familyName" label="Primer apellido" required errors={errors['familyName']} />
      </div>
      <Field name="secondFamilyName" label="Segundo apellido" hint="Opcional." errors={errors['secondFamilyName']} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="email" label="Correo" type="email" required errors={errors['email']} />
        <Field name="phone" label="Teléfono" type="tel" errors={errors['phone']} />
      </div>
      <Field
        name="territory"
        label="Zona de afiliación"
        hint="Estado, municipio o zona que atenderá. No le concede representación territorial."
        errors={errors['territory']}
      />
      <TextArea name="notes" label="Notas internas" rows={3} errors={errors['notes']} />
      <SubmitButton>{pending ? 'Creando…' : 'Crear Embajador Índigo'}</SubmitButton>
    </form>
  );
}

export function UpdateAmbassadorForm({ ambassador }: { readonly ambassador: IndigoAmbassadorView }) {
  const [state, action, pending] = useActionState(updateAmbassadorAction, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ambassadorId" value={ambassador.id} />
      <input type="hidden" name="rowVersion" value={ambassador.rowVersion} />
      {state.status === 'error' && <ErrorNotice title={state.message ?? 'No se pudo actualizar'} />}
      {state.status === 'ok' && <SuccessNotice title={state.message ?? 'Registro actualizado'} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="givenName" label="Nombre" required defaultValue={ambassador.givenName} errors={errors['givenName']} />
        <Field name="familyName" label="Primer apellido" required defaultValue={ambassador.familyName} errors={errors['familyName']} />
      </div>
      <Field
        name="secondFamilyName"
        label="Segundo apellido"
        defaultValue={ambassador.secondFamilyName ?? ''}
        errors={errors['secondFamilyName']}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="email" label="Correo" type="email" required defaultValue={ambassador.email} errors={errors['email']} />
        <Field name="phone" label="Teléfono" type="tel" defaultValue={ambassador.phone ?? ''} errors={errors['phone']} />
      </div>
      <Field
        name="territory"
        label="Zona de afiliación"
        defaultValue={ambassador.territory ?? ''}
        errors={errors['territory']}
      />
      <Select
        name="status"
        label="Estado"
        required
        defaultValue={ambassador.status}
        options={[
          { value: 'ACTIVE', label: 'Activo' },
          { value: 'SUSPENDED', label: 'Suspendido' },
          { value: 'CLOSED', label: 'Baja definitiva' },
        ]}
        errors={errors['status']}
      />
      <TextArea
        name="notes"
        label="Notas internas"
        rows={4}
        defaultValue={ambassador.notes ?? ''}
        errors={errors['notes']}
      />
      <TextArea
        name="reason"
        label="Motivo del cambio"
        hint="Quedará asentado en la bitácora del sistema."
        rows={3}
        required
        errors={errors['reason']}
      />
      <SubmitButton>{pending ? 'Guardando…' : 'Guardar cambios'}</SubmitButton>
    </form>
  );
}
