'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Field,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  draftTemplateAction,
  publishTemplateAction,
  retireTemplateAction,
  type TemplateFormState,
} from './actions';

const INICIAL: TemplateFormState = { status: 'idle' };

const TIPOS: readonly Option[] = [
  { value: 'CALL_NOTICE', label: 'Convocatoria' },
  { value: 'ASSEMBLY_MINUTES', label: 'Acta de asamblea' },
  { value: 'ELECTION_RESULT', label: 'Acta de resultados electorales' },
  { value: 'DISCIPLINARY_DECISION', label: 'Resolución disciplinaria' },
  { value: 'POWER_GRANT', label: 'Poder o representación' },
  { value: 'MEMBERSHIP_RESOLUTION', label: 'Resolución de afiliación' },
  { value: 'CREDENTIAL', label: 'Credencial' },
  { value: 'RECEIPT', label: 'Recibo' },
  { value: 'CERTIFICATE', label: 'Constancia' },
  { value: 'ATTENDANCE_CONSTANCY', label: 'Constancia de asistencia' },
  { value: 'REPORT', label: 'Informe' },
];

/** Redacción de una versión de plantilla. */
export function DraftTemplateForm({ entidades }: { entidades: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(draftTemplateAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo redactar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field name="name" label="Nombre" required errors={estado.fieldErrors?.['name']} />
      <Field
        name="code"
        label="Código"
        required
        hint="Se comparte entre versiones. Por ejemplo: ACTA_ASAMBLEA. La versión se calcula sola."
        errors={estado.fieldErrors?.['code']}
      />
      <Select name="kind" label="Tipo de documento" required options={TIPOS} errors={estado.fieldErrors?.['kind']} />
      <Select
        name="legalEntityId"
        label="Entidad jurídica"
        required
        options={entidades}
        errors={estado.fieldErrors?.['legalEntityId']}
      />
      <Field
        name="numberingSeries"
        label="Serie documental"
        hint="Opcional. Si la dejas en blanco, la serie es el propio código."
        errors={estado.fieldErrors?.['numberingSeries']}
      />
      <TextArea
        name="bodyTemplate"
        label="Cuerpo"
        required
        rows={14}
        hint="Escribe el texto con marcas de variable entre llaves dobles, así: {{nombreDeLaPersona}}. Se admite marcado HTML sencillo para párrafos y listas."
        errors={estado.fieldErrors?.['bodyTemplate']}
      />
      <TextArea
        name="variables"
        label="Variables declaradas"
        required
        rows={3}
        hint="Separadas por comas o por saltos de línea. Publicar comprueba que coincidan exactamente con las que usa el cuerpo."
        errors={estado.fieldErrors?.['variables']}
      />

      <SubmitButton>{pendiente ? 'Redactando…' : 'Redactar la versión'}</SubmitButton>
    </form>
  );
}

/** Publicación de una versión en borrador. */
export function PublishTemplateForm({ templateId, version }: { templateId: string; version: number }) {
  const [estado, accion, pendiente] = useActionState(publishTemplateAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo publicar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
      <p className="text-sm text-[var(--color-ink-soft)]">
        Al publicar, la versión anterior del mismo código queda retirada. Los documentos ya emitidos conservan la
        versión con la que se emitieron.
      </p>
      <SubmitButton>{pendiente ? 'Publicando…' : `Publicar la versión ${version}`}</SubmitButton>
    </form>
  );
}

/** Retiro de una versión. */
export function RetireTemplateForm({ templateId }: { templateId: string }) {
  const [estado, accion, pendiente] = useActionState(retireTemplateAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo retirar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <TextArea name="reason" label="Motivo del retiro" required rows={2} errors={estado.fieldErrors?.['reason']} />
      <SubmitButton variant="danger">{pendiente ? 'Retirando…' : 'Retirar la plantilla'}</SubmitButton>
    </form>
  );
}
