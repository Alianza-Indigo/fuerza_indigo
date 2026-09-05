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
import { addAgendaItemAction, conveneAssemblyAction, issueCallAction, type AssemblyFormState } from './actions';

const INICIAL: AssemblyFormState = { status: 'idle' };

const TIPOS: readonly Option[] = [
  { value: 'ORDINARY', label: 'Ordinaria' },
  { value: 'EXTRAORDINARY', label: 'Extraordinaria' },
  { value: 'SECTIONAL', label: 'Seccional' },
];

const MODALIDADES: readonly Option[] = [
  { value: 'IN_PERSON', label: 'Presencial' },
  { value: 'REMOTE', label: 'A distancia' },
  { value: 'HYBRID', label: 'Mixta' },
];

const PUNTOS: readonly Option[] = [
  { value: 'INFORMATIVE', label: 'Informativo — no se vota' },
  { value: 'DELIBERATIVE', label: 'Deliberativo — se vota por mayoría ordinaria' },
  { value: 'ELECTIVE', label: 'Electivo' },
  { value: 'STATUTE_REFORM', label: 'Reforma estatutaria — mayoría calificada' },
  { value: 'FINANCIAL_REPORT', label: 'Informe financiero' },
  { value: 'DISSOLUTION', label: 'Disolución — mayoría calificada estatutaria' },
];

const CANALES: readonly { value: string; label: string }[] = [
  { value: 'SITIO_WEB', label: 'Sitio web institucional' },
  { value: 'CORREO', label: 'Correo a las personas agremiadas' },
  { value: 'ESTRADOS', label: 'Estrados del local sindical' },
  { value: 'CENTRO_DE_TRABAJO', label: 'Centros de trabajo' },
  { value: 'REDES', label: 'Redes sociales oficiales' },
];

/** Registro de una asamblea. */
export function ConveneForm({
  organos,
  territorios,
  cargos,
}: {
  organos: readonly Option[];
  territorios: readonly Option[];
  cargos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(conveneAssemblyAction, INICIAL);

  if (organos.length === 0) {
    return (
      <Notice tone="warning" title="No hay órganos activos">
        <p>Una asamblea la convoca un órgano. Instálalo antes.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Select name="unionBodyId" label="Órgano" required options={organos} errors={estado.fieldErrors?.['unionBodyId']} />
      <Select
        name="territorialUnitId"
        label="Unidad territorial"
        required
        options={territorios}
        hint="El padrón de la sesión alcanzará a esta unidad y a las que dependen de ella."
        errors={estado.fieldErrors?.['territorialUnitId']}
      />
      <Select name="type" label="Tipo" required options={TIPOS} errors={estado.fieldErrors?.['type']} />
      <Select name="modality" label="Modalidad" required options={MODALIDADES} errors={estado.fieldErrors?.['modality']} />
      <Field
        name="venue"
        label="Lugar"
        hint="Obligatorio salvo en sesiones a distancia."
        errors={estado.fieldErrors?.['venue']}
      />
      <Field
        name="scheduledAt"
        label="Fecha y hora"
        type="datetime-local"
        required
        errors={estado.fieldErrors?.['scheduledAt']}
      />
      <Select
        name="convenedByOfficeTermId"
        label="Convoca"
        options={cargos}
        placeholder="Nadie: la convoca la petición de agremiados"
        hint="Un cargo en funciones. Si la convoca la petición del porcentaje estatutario, márcalo abajo."
        errors={estado.fieldErrors?.['convenedByOfficeTermId']}
      />
      <Checkbox
        name="convenedByPetition"
        label="La convoca la petición escrita del porcentaje estatutario de agremiados"
        errors={estado.fieldErrors?.['convenedByPetition']}
      />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar la asamblea'}</SubmitButton>
    </form>
  );
}

/** Punto del orden del día. Solo antes de convocar. */
export function AgendaItemForm({ assemblyId }: { assemblyId: string }) {
  const [estado, accion, pendiente] = useActionState(addAgendaItemAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="assemblyId" value={assemblyId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo añadir'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field name="title" label="Título del punto" required errors={estado.fieldErrors?.['title']} />
      <TextArea
        name="description"
        label="Descripción"
        required
        rows={3}
        hint="Qué se va a tratar. Es lo que leerá quien decida si asiste."
        errors={estado.fieldErrors?.['description']}
      />
      <Select
        name="kind"
        label="Tipo de punto"
        required
        options={PUNTOS}
        hint="La mayoría exigida se deduce del tipo: no se elige."
        errors={estado.fieldErrors?.['kind']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Añadiendo…' : 'Añadir el punto'}</SubmitButton>
    </form>
  );
}

/** Emisión de una convocatoria. */
export function IssueCallForm({
  assemblyId,
  ordinal,
  plantillas,
}: {
  assemblyId: string;
  ordinal: 'FIRST' | 'SECOND';
  plantillas: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(issueCallAction, INICIAL);

  if (plantillas.length === 0) {
    return (
      <Notice tone="warning" title="No hay plantilla publicada de convocatoria">
        <p>Publica una plantilla de tipo «convocatoria» antes de convocar.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="assemblyId" value={assemblyId} />
      <input type="hidden" name="ordinal" value={ordinal} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo convocar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Canales de publicación</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">Al menos uno: publicar en ninguno no es publicar.</p>
        {estado.fieldErrors?.['publishedChannels'] !== undefined && (
          <ul className="space-y-1 text-sm text-[var(--color-danger)]">
            {estado.fieldErrors['publishedChannels'].map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}
        <div className="space-y-1 rounded-lg border border-[var(--color-line)] p-3">
          {CANALES.map((canal) => (
            <label key={canal.value} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="publishedChannels" value={canal.value} className="size-4" />
              <span>{canal.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Select
        name="templateCode"
        label="Plantilla del documento"
        required
        options={plantillas}
        errors={estado.fieldErrors?.['templateCode']}
      />

      <SubmitButton>
        {pendiente
          ? 'Emitiendo…'
          : ordinal === 'FIRST'
            ? 'Emitir la primera convocatoria'
            : 'Emitir la segunda convocatoria'}
      </SubmitButton>
    </form>
  );
}
