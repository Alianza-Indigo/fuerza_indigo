'use client';

import { useActionState } from 'react';
import {
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
  addProposalAction,
  advanceFileAction,
  assignBargainingCommissionAction,
  openConsultationAction,
  openFileAction,
  type BargainingFormState,
} from './actions';

const INICIAL: BargainingFormState = { status: 'idle' };

const TIPOS: readonly Option[] = [
  { value: 'COLLECTIVE_AGREEMENT_NEGOTIATION', label: 'Negociación de contrato colectivo' },
  { value: 'CONTRACT_REVIEW', label: 'Revisión contractual' },
  { value: 'WAGE_REVIEW', label: 'Revisión salarial' },
  { value: 'COLLECTIVE_DISPUTE', label: 'Conflicto colectivo' },
  { value: 'STRIKE_PROCEDURE', label: 'Procedimiento de huelga — exige acuerdo de asamblea' },
];

const ESTADOS: readonly Option[] = [
  { value: 'OPEN', label: 'Abierto' },
  { value: 'NEGOTIATION', label: 'En negociación' },
  { value: 'CONSULTATION', label: 'En consulta' },
  { value: 'CONCILIATION', label: 'En conciliación' },
  { value: 'STRIKE_PROCEDURE', label: 'Procedimiento de huelga — exige acuerdo de asamblea' },
  { value: 'CONCLUDED', label: 'Concluido' },
  { value: 'ARCHIVED', label: 'Archivado' },
];

function Aviso({ estado }: { estado: BargainingFormState }) {
  return (
    <>
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo completar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
    </>
  );
}

/** Apertura de un expediente. */
export function OpenFileForm({
  territorios,
  organizaciones,
  acuerdos,
}: {
  territorios: readonly Option[];
  organizaciones: readonly Option[];
  acuerdos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(openFileAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      <Aviso estado={estado} />

      <Select name="kind" label="Tipo de expediente" required options={TIPOS} errors={estado.fieldErrors?.['kind']} />
      <Select
        name="territorialUnitId"
        label="Unidad territorial"
        required
        options={territorios}
        errors={estado.fieldErrors?.['territorialUnitId']}
      />
      <Select
        name="counterpartOrganizationId"
        label="Contraparte"
        options={organizaciones}
        placeholder="Sin contraparte registrada"
        errors={estado.fieldErrors?.['counterpartOrganizationId']}
      />
      <Select
        name="enablingResolutionId"
        label="Acuerdo habilitante"
        options={acuerdos}
        placeholder="Ninguno"
        hint="Obligatorio para un procedimiento de huelga. Ninguna automatización puede iniciarlo: hace falta el acuerdo de la asamblea."
        errors={estado.fieldErrors?.['enablingResolutionId']}
      />
      <Field
        name="authorityCaseNumber"
        label="Expediente ante la autoridad"
        hint="Opcional. El número que le asigne la autoridad laboral, si ya lo tiene."
        errors={estado.fieldErrors?.['authorityCaseNumber']}
      />
      <TextArea name="reason" label="Motivo de apertura" required rows={2} errors={estado.fieldErrors?.['reason']} />

      <SubmitButton>{pendiente ? 'Abriendo…' : 'Abrir el expediente'}</SubmitButton>
    </form>
  );
}

/** Integración de la comisión negociadora. */
export function BargainingCommissionForm({
  fileId,
  personas,
  cargos,
}: {
  fileId: string;
  personas: readonly Option[];
  cargos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(assignBargainingCommissionAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="fileId" value={fileId} />
      <Aviso estado={estado} />

      <Select name="personId" label="Persona" required options={personas} errors={estado.fieldErrors?.['personId']} />
      <Select
        name="officeTermId"
        label="Cargo desde el que participa"
        options={cargos}
        placeholder="Ninguno"
        errors={estado.fieldErrors?.['officeTermId']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Integrando…' : 'Integrar a la comisión'}</SubmitButton>
    </form>
  );
}

/** Propuesta versionada. */
export function ProposalForm({ fileId, plantillas }: { fileId: string; plantillas: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(addProposalAction, INICIAL);

  if (plantillas.length === 0) {
    return (
      <Notice tone="warning" title="No hay plantilla publicada de informe">
        <p>Una propuesta se registra con su documento. Publica una plantilla de tipo «informe» y vuelve.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="fileId" value={fileId} />
      <Aviso estado={estado} />

      <Field name="summary" label="Resumen" required errors={estado.fieldErrors?.['summary']} />
      <TextArea name="text" label="Texto de la propuesta" required rows={8} errors={estado.fieldErrors?.['text']} />
      <Select
        name="templateCode"
        label="Plantilla del documento"
        required
        options={plantillas}
        errors={estado.fieldErrors?.['templateCode']}
      />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Las propuestas anteriores se conservan: en una negociación, lo que se ofreció antes importa tanto como lo que
        se ofrece ahora.
      </p>

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar la propuesta'}</SubmitButton>
    </form>
  );
}

/** Apertura de la consulta a los agremiados afectados. */
export function ConsultationForm({ fileId }: { fileId: string }) {
  const [estado, accion, pendiente] = useActionState(openConsultationAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="fileId" value={fileId} />
      <Aviso estado={estado} />

      <Field name="title" label="Título de la consulta" required errors={estado.fieldErrors?.['title']} />
      <Field name="opensAt" label="Abre" type="datetime-local" required errors={estado.fieldErrors?.['opensAt']} />
      <Field name="closesAt" label="Cierra" type="datetime-local" required errors={estado.fieldErrors?.['closesAt']} />
      <TextArea name="reason" label="Motivo" required rows={2} errors={estado.fieldErrors?.['reason']} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Al abrirla se congela el padrón de agremiados afectados, con su huella. La votación es secreta, con las dos
        opciones que admite una consulta contractual.
      </p>

      <SubmitButton>{pendiente ? 'Abriendo…' : 'Abrir la consulta'}</SubmitButton>
    </form>
  );
}

/** Cambio de estado del expediente. */
export function AdvanceFileForm({ fileId }: { fileId: string }) {
  const [estado, accion, pendiente] = useActionState(advanceFileAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="fileId" value={fileId} />
      <Aviso estado={estado} />

      <Select name="to" label="Pasar a" required options={ESTADOS} errors={estado.fieldErrors?.['to']} />
      <TextArea name="reason" label="Motivo" required rows={2} errors={estado.fieldErrors?.['reason']} />

      <SubmitButton variant="secondary">{pendiente ? 'Guardando…' : 'Cambiar el estado'}</SubmitButton>
    </form>
  );
}
