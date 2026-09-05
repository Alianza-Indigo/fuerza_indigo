'use client';

import { useActionState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Field,
  Notice,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  grantConsentAction,
  registerCareRelationshipAction,
  revokeCareRelationshipAction,
  revokeConsentAction,
  type RelacionFormState,
} from './relationship-actions';
import { ALCANCE, RELACION } from './etiquetas';

const INICIAL: RelacionFormState = { status: 'idle' };

const TIPOS: readonly Option[] = Object.entries(RELACION).map(([value, label]) => ({ value, label }));
const ALCANCES = Object.entries(ALCANCE);

const MEDIOS: readonly Option[] = [
  { value: 'SCREEN', label: 'En pantalla, la propia persona' },
  { value: 'SIGNED_PAPER', label: 'En papel firmado' },
  { value: 'VERBAL_WITH_WITNESS', label: 'De viva voz, con testigo' },
];

/**
 * Registro de una relación de cuidado (PRD §3.5).
 *
 * El alcance que se marca aquí es **lo que la relación llegaría a alcanzar**, no
 * lo que alcanza. Sin consentimiento vigente no alcanza nada, y el aviso lo dice
 * antes de guardar para que nadie se vaya creyendo lo contrario.
 */
export function CareRelationshipForm({
  anchorPersonId,
  personas,
}: {
  anchorPersonId: string;
  personas: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(registerCareRelationshipAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="anchorPersonId" value={anchorPersonId} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Relación registrada'} />}

      <Select
        name="fromPersonId"
        label="Quien cuida, representa o acompaña"
        required
        options={personas}
        defaultValue={anchorPersonId}
        errors={estado.fieldErrors?.['fromPersonId']}
      />
      <Select
        name="toPersonId"
        label="Quien es cuidada, representada o acompañada"
        required
        options={personas}
        errors={estado.fieldErrors?.['toPersonId']}
      />
      <Select
        name="kind"
        label="Qué relación es"
        required
        options={TIPOS}
        errors={estado.fieldErrors?.['kind']}
      />

      <fieldset className="space-y-2 rounded-lg border border-[var(--color-line)] p-4">
        <legend className="px-1 text-sm font-semibold">A qué llegaría</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Marcar esto <strong>no</strong> concede acceso. Dice a dónde llegaría la relación el día que la
          persona otorgue su consentimiento.
        </p>
        {ALCANCES.map(([valor, etiqueta]) => (
          <Checkbox key={valor} name={`scope.${valor}`} label={etiqueta} />
        ))}
      </fieldset>

      <Field name="startsAt" label="Desde" type="date" hint="Opcional. Si lo dejas vacío, empieza hoy." />
      <Field name="endsAt" label="Hasta" type="date" hint="Opcional." errors={estado.fieldErrors?.['endsAt']} />

      <Notice tone="neutral" title="Una relación familiar no abre expedientes por sí sola">
        <p>
          Es la regla del PRD §3.5 y se cumple literalmente: mientras no haya consentimiento vigente, esta
          relación no alcanza nada.
        </p>
      </Notice>

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar la relación'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Registrando' : ''}</p>
    </form>
  );
}

export function RevokeRelationshipForm({
  relationshipId,
  anchorPersonId,
}: {
  relationshipId: string;
  anchorPersonId: string;
}) {
  const [estado, accion, pendiente] = useActionState(revokeCareRelationshipAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Relación revocada'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <input type="hidden" name="anchorPersonId" value={anchorPersonId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo revocar'} />}
      <TextArea name="reason" label="Por qué se revoca" required rows={2} errors={estado.fieldErrors?.['reason']} />
      <SubmitButton variant="danger">{pendiente ? 'Revocando…' : 'Revocar la relación'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Revocando' : ''}</p>
    </form>
  );
}

/**
 * Registro de un consentimiento (PRD §7.3).
 *
 * Se otorga sobre un texto publicado que cubra ese propósito. Si quien lo otorga
 * no es la titular, hay que decir en qué relación se apoya: sin esa prueba,
 * cualquiera podría consentir por cualquiera.
 */
export function GrantConsentForm({
  personId,
  textos,
  propositos,
  relaciones,
}: {
  personId: string;
  textos: readonly Option[];
  propositos: readonly Option[];
  relaciones: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(grantConsentAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="personId" value={personId} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Consentimiento registrado'} />}

      {textos.length === 0 ? (
        <Notice tone="warning" title="No hay ningún texto publicado que sirva para consentir">
          <p>
            Redacta y publica uno en «Avisos y consentimientos» antes de registrar consentimientos aquí. Un
            consentimiento sobre un texto que nadie puede leer no vale nada.
          </p>
        </Notice>
      ) : (
        <>
          <Select
            name="purpose"
            label="Para qué"
            required
            hint="Un consentimiento genérico no sustituye a uno específico."
            options={propositos}
            errors={estado.fieldErrors?.['purpose']}
          />
          <Select
            name="consentVersionId"
            label="Texto que se acepta"
            required
            options={textos}
            errors={estado.fieldErrors?.['consentVersionId']}
          />
          <Select
            name="medium"
            label="Cómo se recabó"
            required
            options={MEDIOS}
            errors={estado.fieldErrors?.['medium']}
          />
          <TextArea
            name="mediumNote"
            label="Nota"
            rows={2}
            hint="Opcional. Por ejemplo, quién fue testigo o dónde está el papel firmado."
            errors={estado.fieldErrors?.['mediumNote']}
          />
          <Select
            name="representationRef"
            label="Relación en la que se apoya"
            hint="Obligatoria si no lo otorga la propia persona."
            options={relaciones}
            placeholder="Lo otorga la propia persona"
            errors={estado.fieldErrors?.['representationRef']}
          />
          <Field
            name="expiresAt"
            label="Vence el"
            type="date"
            hint="Opcional. Sin fecha, dura hasta que se revoque."
            errors={estado.fieldErrors?.['expiresAt']}
          />

          <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar el consentimiento'}</SubmitButton>
          <p aria-live="polite" className="sr-only">{pendiente ? 'Registrando' : ''}</p>
        </>
      )}
    </form>
  );
}

export function RevokeConsentForm({ consentId, personId }: { consentId: string; personId: string }) {
  const [estado, accion, pendiente] = useActionState(revokeConsentAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Revocado'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="consentId" value={consentId} />
      <input type="hidden" name="personId" value={personId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo revocar'} />}
      <TextArea name="reason" label="Por qué se revoca" required rows={2} errors={estado.fieldErrors?.['reason']} />
      <SubmitButton variant="danger">{pendiente ? 'Revocando…' : 'Revocar'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Revocando' : ''}</p>
    </form>
  );
}
