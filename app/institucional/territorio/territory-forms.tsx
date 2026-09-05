'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, Select, SubmitButton, SuccessNotice, TextArea, type Option } from '@/design-system/primitives';
import {
  createTerritorialUnitAction,
  dissolveTerritorialUnitAction,
  updateTerritorialUnitAction,
  type TerritorialFormState,
} from './actions';

const INICIAL: TerritorialFormState = { status: 'idle' };

const TIPOS: readonly Option[] = [
  { value: 'STATE', label: 'Entidad federativa o región equivalente' },
  { value: 'FOREIGN_COUNTRY', label: 'País extranjero' },
  { value: 'MUNICIPALITY', label: 'Municipio, alcaldía o localidad' },
  { value: 'SECTION', label: 'Sección' },
  { value: 'DELEGATION', label: 'Delegación' },
  { value: 'OFFICE', label: 'Representación u oficina' },
  { value: 'VIRTUAL_THEMATIC', label: 'Ámbito virtual o temático' },
];

const ESTADOS: readonly Option[] = [
  { value: 'PLANNED', label: 'Planeada — acordada pero todavía no instalada' },
  { value: 'ACTIVE', label: 'Activa — instalada y en funciones' },
  { value: 'SUSPENDED', label: 'Suspendida — sin funciones, sin disolverse' },
];

/**
 * Alta de una unidad territorial.
 *
 * El acuerdo habilitante es obligatorio y su desplegable solo trae resoluciones
 * aprobadas. Cuando no hay ninguna, el formulario lo dice en vez de ofrecer un
 * botón que va a fallar (PRD §0.3).
 */
export function CreateUnitForm({
  padres,
  acuerdos,
}: {
  padres: readonly Option[];
  acuerdos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(createTerritorialUnitAction, INICIAL);

  if (acuerdos.length === 0) {
    return (
      <ErrorNotice title="Todavía no hay ninguna resolución aprobada">
        <p>
          Una unidad territorial nace de un acuerdo de asamblea, no de un formulario. Cuando la asamblea apruebe
          constituirla, la resolución aparecerá aquí y el alta será posible.
        </p>
      </ErrorNotice>
    );
  }

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo constituir la unidad'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field
        name="name"
        label="Nombre"
        required
        hint="Como se le nombra institucionalmente. Por ejemplo: Sección Guadalajara Centro."
        errors={estado.fieldErrors?.['name']}
      />

      <Field
        name="code"
        label="Código"
        required
        hint="Mayúsculas, números y guiones bajos. Forma la ruta de la unidad y ya no se cambia. Por ejemplo: SEC_GDL_01."
        errors={estado.fieldErrors?.['code']}
      />

      <Select name="type" label="Tipo" required options={TIPOS} errors={estado.fieldErrors?.['type']} />

      <Select
        name="parentId"
        label="Depende de"
        required
        options={padres}
        hint="La unidad de la que cuelga. No se cambia después: una unidad que deja de pertenecer donde estaba se disuelve y se constituye otra."
        errors={estado.fieldErrors?.['parentId']}
      />

      <Select
        name="enablingResolutionId"
        label="Acuerdo habilitante"
        required
        options={acuerdos}
        hint="La resolución aprobada que acuerda constituirla."
        errors={estado.fieldErrors?.['enablingResolutionId']}
      />

      <Field
        name="createdOn"
        label="Fecha de constitución"
        type="date"
        required
        errors={estado.fieldErrors?.['createdOn']}
      />

      <Field
        name="stateCode"
        label="Clave de la entidad federativa"
        hint="Opcional. Clave oficial, si la unidad corresponde a una."
        errors={estado.fieldErrors?.['stateCode']}
      />

      <Field
        name="municipalityCode"
        label="Clave del municipio"
        hint="Opcional. Clave oficial, si la unidad corresponde a uno."
        errors={estado.fieldErrors?.['municipalityCode']}
      />

      <Field
        name="contactEmail"
        label="Correo de contacto"
        type="email"
        hint="Opcional. El correo con el que la unidad atiende a las personas agremiadas."
        errors={estado.fieldErrors?.['contactEmail']}
      />

      <SubmitButton>{pendiente ? 'Constituyendo…' : 'Constituir la unidad'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Constituyendo la unidad territorial' : ''}
      </p>
    </form>
  );
}

/** Edición de lo que sí cambia: nombre, contacto y estado. */
export function UpdateUnitForm({
  territorialUnitId,
  name,
  contactEmail,
  status,
}: {
  territorialUnitId: string;
  name: string;
  contactEmail: string | null;
  status: string;
}) {
  const [estado, accion, pendiente] = useActionState(updateTerritorialUnitAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="territorialUnitId" value={territorialUnitId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo actualizar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field name="name" label="Nombre" required defaultValue={name} errors={estado.fieldErrors?.['name']} />
      <Field
        name="contactEmail"
        label="Correo de contacto"
        type="email"
        defaultValue={contactEmail ?? ''}
        errors={estado.fieldErrors?.['contactEmail']}
      />
      <Select
        name="status"
        label="Estado"
        required
        options={ESTADOS}
        defaultValue={status}
        hint="La disolución no está aquí: tiene su propio acto, con fecha y motivo escrito."
        errors={estado.fieldErrors?.['status']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Guardando…' : 'Guardar cambios'}</SubmitButton>
    </form>
  );
}

/** Disolución, con fecha y motivo escrito. */
export function DissolveUnitForm({ territorialUnitId, name }: { territorialUnitId: string; name: string }) {
  const [estado, accion, pendiente] = useActionState(dissolveTerritorialUnitAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="territorialUnitId" value={territorialUnitId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo disolver'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field
        name="dissolvedOn"
        label="Fecha de disolución"
        type="date"
        required
        errors={estado.fieldErrors?.['dissolvedOn']}
      />
      <TextArea
        name="reason"
        label={`Motivo para disolver «${name}»`}
        required
        rows={3}
        hint="Queda en la bitácora. Al menos veinte caracteres: escribe por qué se disuelve."
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton variant="danger">{pendiente ? 'Disolviendo…' : 'Disolver la unidad'}</SubmitButton>
    </form>
  );
}
