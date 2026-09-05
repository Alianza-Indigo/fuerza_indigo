'use client';

import { useActionState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Field,
  SubmitButton,
  SuccessNotice,
  TextArea,
  Select,
  type Option,
} from '@/design-system/primitives';
import {
  draftConsentVersionAction,
  publishConsentVersionAction,
  retireConsentVersionAction,
  type ConsentimientoFormState,
} from './actions';
import { PROPOSITOS } from './etiquetas';

const INICIAL: ConsentimientoFormState = { status: 'idle' };


/**
 * Redacción de un texto nuevo (defecto `D-F4-001`).
 *
 * Un texto nace en borrador y no sirve para nada hasta que se publica. Que sea
 * un paso aparte no es burocracia: publicar es el acto por el que la
 * organización se compromete con lo que ahí dice.
 */
export function DraftConsentForm({ entidades }: { entidades: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(draftConsentVersionAction, INICIAL);
  const dato = (campo: string): string | undefined => estado.values?.[campo];
  const clave = estado.status === 'idle' ? 'inicial' : JSON.stringify(estado.values ?? {});

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Borrador creado'} />}

      <div key={clave} className="space-y-5">
        <Field
          name="code"
          label="Código"
          required
          hint="Identifica al aviso a lo largo de sus versiones. Por ejemplo: PRIVACY_NOTICE_DIRECTORY."
          defaultValue={dato('code')}
          errors={estado.fieldErrors?.['code']}
        />
        <Select
          name="legalEntityId"
          label="Entidad"
          required
          options={entidades}
          defaultValue={dato('legalEntityId')}
          errors={estado.fieldErrors?.['legalEntityId']}
        />
        <Field
          name="title"
          label="Título"
          required
          defaultValue={dato('title')}
          errors={estado.fieldErrors?.['title']}
        />
        <TextArea
          name="plainLanguageSummary"
          label="Resumen en lenguaje claro"
          required
          rows={5}
          hint="Es lo que la mayoría va a leer de verdad. Sin jerga, en frases cortas."
          defaultValue={dato('plainLanguageSummary')}
          errors={estado.fieldErrors?.['plainLanguageSummary']}
        />
        <TextArea
          name="bodyMarkdown"
          label="Texto completo"
          required
          rows={12}
          hint="Admite formato Markdown."
          defaultValue={dato('bodyMarkdown')}
          errors={estado.fieldErrors?.['bodyMarkdown']}
        />

        <fieldset className="space-y-2 rounded-lg border border-[var(--color-line)] p-4">
          <legend className="px-1 text-sm font-semibold">Para qué sirve este texto</legend>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Un consentimiento solo se puede otorgar sobre un texto que cubra ese propósito. Sin marcar nada,
            el texto es un aviso informativo y no sirve para consentir.
          </p>
          {PROPOSITOS.map((proposito) => (
            <Checkbox
              key={proposito.value}
              name={`requiredFor.${proposito.value}`}
              label={proposito.label}
            />
          ))}
        </fieldset>
      </div>

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar borrador'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Guardando' : ''}</p>
    </form>
  );
}

/** Publicación de un borrador. Retira la versión anterior en el mismo acto. */
export function PublishConsentForm({ consentVersionId }: { consentVersionId: string }) {
  const [estado, accion, pendiente] = useActionState(publishConsentVersionAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Publicado'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="consentVersionId" value={consentVersionId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo publicar'} />}
      <Field
        name="effectiveFrom"
        label="Rige desde"
        type="date"
        required
        errors={estado.fieldErrors?.['effectiveFrom']}
      />
      <SubmitButton>{pendiente ? 'Publicando…' : 'Publicar'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Publicando' : ''}</p>
    </form>
  );
}

/** Retiro de un texto publicado, sin sustituirlo. */
export function RetireConsentForm({ consentVersionId }: { consentVersionId: string }) {
  const [estado, accion, pendiente] = useActionState(retireConsentVersionAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Retirado'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="consentVersionId" value={consentVersionId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo retirar'} />}
      <TextArea
        name="reason"
        label="Por qué se retira"
        required
        rows={2}
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton variant="danger">{pendiente ? 'Retirando…' : 'Retirar'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Retirando' : ''}</p>
    </form>
  );
}
