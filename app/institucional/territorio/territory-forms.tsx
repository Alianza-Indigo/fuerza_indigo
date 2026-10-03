'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Checkbox, ErrorNotice, Field, Notice, RadioGroup, Select, SubmitButton, SuccessNotice, TextArea, type Option } from '@/design-system/primitives';
import {
  attachSignedTerritorialAppointmentAction,
  createTerritorialDeploymentByAppointmentAction,
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
  { value: 'SECTION', label: 'Sección o seccional' },
  { value: 'DELEGATION', label: 'Delegación estatal o municipal' },
  { value: 'OFFICE', label: 'Representación u oficina' },
  { value: 'VIRTUAL_THEMATIC', label: 'Ámbito virtual o temático' },
];

const ESTADOS: readonly Option[] = [
  { value: 'PLANNED', label: 'Planeada — acordada pero todavía no instalada' },
  { value: 'ACTIVE', label: 'Activa — instalada y en funciones' },
  { value: 'SUSPENDED', label: 'Suspendida — sin funciones, sin disolverse' },
];

const NIVELES_NOMBRAMIENTO: readonly Option[] = [
  { value: 'STATE', label: 'Delegación estatal' },
  { value: 'MUNICIPALITY', label: 'Delegación municipal' },
  { value: 'SECTION', label: 'Seccional' },
];

/** Constitución e instalación completa mediante nombramiento directo. */
export function CreateByAppointmentForm({
  estados,
  delegacionesEstatales,
  delegaciones,
  entidades,
  personas,
}: {
  estados: readonly Option[];
  delegacionesEstatales: readonly Option[];
  delegaciones: readonly Option[];
  entidades: readonly Option[];
  personas: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(createTerritorialDeploymentByAppointmentAction, INICIAL);
  const [nivel, setNivel] = useState<'STATE' | 'MUNICIPALITY' | 'SECTION'>('STATE');
  const padres = nivel === 'STATE'
    ? estados
    : nivel === 'MUNICIPALITY'
      ? delegacionesEstatales
      : delegaciones;

  if (personas.length === 0) {
    return <Notice tone="warning" title="No hay personas nombrables"><p>Primero debe existir una persona agremiada activa y en pleno goce de derechos.</p></Notice>;
  }
  if (entidades.length === 0) {
    return <Notice tone="warning" title="No hay una entidad jurídica disponible"><p>Completa primero la ficha institucional de Fuerza Índigo.</p></Notice>;
  }

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo emitir el nombramiento'} />}
      {estado.status === 'ok' && (
        <SuccessNotice title={estado.message ?? 'Nombramiento registrado'}>
          {estado.appointmentPublicId !== undefined && (
            <Link
              href={`/institucional/territorio/nombramientos/${estado.appointmentPublicId}`}
              className="underline underline-offset-4"
            >
              Abrir el acuerdo generado y adjuntar su copia firmada
            </Link>
          )}
        </SuccessNotice>
      )}

      <RadioGroup
        name="level"
        legend="Nivel territorial"
        options={NIVELES_NOMBRAMIENTO}
        value={nivel}
        onChange={(value) => setNivel(value as 'STATE' | 'MUNICIPALITY' | 'SECTION')}
        errors={estado.fieldErrors?.['level']}
      />
      <Field name="name" label="Nombre institucional" required hint="Por ejemplo: Delegación Estatal de Chihuahua." errors={estado.fieldErrors?.['name']} />
      <Field name="code" label="Código" required hint="Mayúsculas, números y guiones bajos. Por ejemplo: DEL_CHIHUAHUA." errors={estado.fieldErrors?.['code']} />
      {padres.length === 0 ? (
        <Notice tone="warning" title={nivel === 'STATE' ? 'No hay entidades federativas disponibles' : 'Primero crea la delegación superior'}>
          <p>{nivel === 'STATE' ? 'La semilla territorial debe contener las entidades federativas.' : 'Las delegaciones municipales y seccionales dependen de una delegación ya instalada.'}</p>
        </Notice>
      ) : (
        <Select
          key={nivel}
          name="parentId"
          label="Depende de"
          required
          options={padres}
          hint={
            nivel === 'STATE'
              ? 'Entidad federativa donde se constituye.'
              : nivel === 'MUNICIPALITY'
                ? 'La delegación estatal de la que dependerá.'
                : 'La delegación estatal o municipal de la que dependerá.'
          }
          errors={estado.fieldErrors?.['parentId']}
        />
      )}
      <Select name="legalEntityId" label="Entidad jurídica" required options={entidades} errors={estado.fieldErrors?.['legalEntityId']} />
      <Select name="appointedMembershipId" label="Persona responsable" required options={personas} hint="El nombramiento le concede acceso limitado a esta unidad y sus descendientes." errors={estado.fieldErrors?.['appointedMembershipId']} />
      <Field name="appointedOn" label="Fecha del nombramiento" type="date" required errors={estado.fieldErrors?.['appointedOn']} />
      <Field name="termMonths" label="Duración del periodo (meses)" type="number" inputMode="numeric" required errors={estado.fieldErrors?.['termMonths']} />
      <Checkbox name="reelectionAllowed" label="Se admite un nuevo nombramiento al concluir el periodo" errors={estado.fieldErrors?.['reelectionAllowed']} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="stateCode" label="Clave de la entidad federativa" required={nivel === 'STATE'} hint="Por ejemplo: CHH." errors={estado.fieldErrors?.['stateCode']} />
        {nivel === 'MUNICIPALITY' && <Field name="municipalityCode" label="Clave del municipio" required hint="Clave oficial o institucional del municipio." errors={estado.fieldErrors?.['municipalityCode']} />}
      </div>
      <Field name="contactEmail" label="Correo institucional de contacto" type="email" errors={estado.fieldErrors?.['contactEmail']} />
      <TextArea name="reason" label="Motivo y alcance del nombramiento" required rows={4} hint="Este texto constituye la evidencia del acto y queda en la bitácora." errors={estado.fieldErrors?.['reason']} />

      {padres.length > 0 && <SubmitButton>{pendiente ? 'Emitiendo nombramiento…' : 'Constituir y nombrar responsable'}</SubmitButton>}
    </form>
  );
}

/** Incorpora la copia firmada al acuerdo generado sin repetir el nombramiento. */
export function SignedTerritorialAppointmentForm({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [state, action, pending] = useActionState(attachSignedTerritorialAppointmentAction, INICIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="appointmentId" value={appointmentId} />

      {state.status === 'error' && <ErrorNotice title={state.message ?? 'No se pudo adjuntar el acuerdo'} />}
      {state.status === 'ok' && <SuccessNotice title={state.message ?? 'Copia firmada incorporada'} />}

      <div className="space-y-1.5">
        <label htmlFor="signedFile" className="block text-sm font-medium">
          Copia firmada
        </label>
        <p id="signedFile-help" className="text-sm text-[var(--color-ink-soft)]">
          PDF, PNG o JPG, hasta 5 MB. Se conserva en privado dentro del expediente institucional.
        </p>
        <input
          id="signedFile"
          name="signedFile"
          type="file"
          required
          accept="application/pdf,image/png,image/jpeg"
          aria-describedby="signedFile-help"
          className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2"
        />
        {state.fieldErrors?.['signedFile'] !== undefined && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {state.fieldErrors['signedFile'].join(' ')}
          </p>
        )}
      </div>

      <SubmitButton>{pending ? 'Incorporando…' : 'Adjuntar copia firmada'}</SubmitButton>
    </form>
  );
}

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
        hint="Déjala vacía para una delegación estatal; indícala para una delegación municipal."
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
