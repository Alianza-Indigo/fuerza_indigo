'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Field,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import {
  issueCredentialAction,
  replaceCredentialAction,
  revokeCredentialAction,
  type CredencialState,
} from './actions';
import { TIPOS_QUE_SE_EMITEN } from './etiquetas';

const INICIAL: CredencialState = { status: 'idle' };

/**
 * Emitir una credencial de cargo o de autorización profesional.
 *
 * Las de agremiado y honoraria **no están aquí**: nacen con la membresía y no
 * las ordena nadie desde una pantalla. Ofrecer un botón para emitirlas a mano
 * abriría la puerta a una credencial de agremiado sin membresía detrás, que es
 * exactamente lo que la comprobación de la base impide.
 */
export function IssueForm({
  personas,
  entidades,
}: {
  personas: readonly { readonly value: string; readonly label: string }[];
  entidades: readonly { readonly value: string; readonly label: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(issueCredentialAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Credencial emitida'} />;

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo emitir'} />}

      <Select
        name="personId"
        label="Persona titular"
        required
        options={personas}
        placeholder="Elige a la persona"
        defaultValue={estado.values?.['personId']}
        errors={estado.fieldErrors?.['personId']}
      />

      <RadioGroup
        name="kind"
        legend="Qué acredita"
        options={TIPOS_QUE_SE_EMITEN.map((uno) => ({
          value: uno.value,
          label: uno.label,
          hint: uno.hint,
        }))}
        value={estado.values?.['kind']}
        errors={estado.fieldErrors?.['kind']}
      />

      <Select
        name="legalEntityId"
        label="Entidad que la emite"
        required
        options={entidades}
        placeholder="Elige la entidad"
        defaultValue={estado.values?.['legalEntityId']}
        errors={estado.fieldErrors?.['legalEntityId']}
      />

      <Field
        name="territoryLabel"
        label="Cargo, territorio o autorización"
        required
        hint="Va impreso en la credencial y es lo que se lee al verificarla. Escríbelo como quieres que se lea."
        defaultValue={estado.values?.['territoryLabel']}
        errors={estado.fieldErrors?.['territoryLabel']}
      />

      <Field
        name="expiresOn"
        type="date"
        label="Vigencia hasta (opcional)"
        hint="Un cargo tiene periodo; una autorización profesional puede no tenerlo. Déjalo vacío si no vence."
        defaultValue={estado.values?.['expiresOn']}
        errors={estado.fieldErrors?.['expiresOn']}
      />

      <TextArea
        name="reason"
        label="Por qué se emite"
        required
        rows={3}
        hint="Queda en la bitácora. Una credencial es un documento: tiene que constar quién la ordenó y por qué."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton>{pendiente ? 'Emitiendo…' : 'Emitir credencial'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Emitiendo' : ''}</p>
    </form>
  );
}

/** Revocar: esta credencial deja de acreditar, y deja de hacerlo ahora. */
export function RevokeForm({ credentialId }: { credentialId: string }) {
  const [estado, accion, pendiente] = useActionState(revokeCredentialAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Credencial revocada'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="credentialId" value={credentialId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo revocar'} />}
      <TextArea
        name="reason"
        label="Por qué se revoca"
        required
        rows={2}
        hint="Se guarda en la bitácora, no se enseña en el verificador."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton variant="danger">{pendiente ? 'Revocando…' : 'Revocar'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Revocando' : ''}</p>
    </form>
  );
}

/** Reponer: la persona sigue acreditando lo mismo, con otro documento. */
export function ReplaceForm({ credentialId }: { credentialId: string }) {
  const [estado, accion, pendiente] = useActionState(replaceCredentialAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Credencial repuesta'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="credentialId" value={credentialId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo reponer'} />}
      <TextArea
        name="reason"
        label="Por qué se repone"
        required
        rows={2}
        hint="Por ejemplo: se perdió, se deterioró, cambió el nombre autorizado."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Reponiendo…' : 'Reponer'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Reponiendo' : ''}</p>
    </form>
  );
}
