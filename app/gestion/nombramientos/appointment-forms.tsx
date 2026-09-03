'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { assignRoleAction, revokeRoleAction, type AppointmentFormState } from './actions';

const INICIAL: AppointmentFormState = { status: 'idle' };

export interface Opcion {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

/**
 * Formulario de nombramiento.
 *
 * Las listas que recibe ya vienen filtradas por el servidor a lo que esta
 * persona puede otorgar de verdad. No se muestran opciones que la regla de no
 * elevación vaya a rechazar: un desplegable con opciones que siempre fallan es
 * un botón sin acción (PRD §0.3).
 */
export function AssignForm({
  cuentas,
  roles,
  entidades,
  territorios,
}: {
  cuentas: readonly Opcion[];
  roles: readonly Opcion[];
  entidades: readonly Opcion[];
  territorios: readonly Opcion[];
}) {
  const [estado, accion, pendiente] = useActionState(assignRoleAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Select
        name="userId"
        label="Persona"
        required
        opciones={cuentas}
        errors={estado.fieldErrors?.['userId']}
        hint="Tu propia cuenta no aparece: los nombramientos los hace siempre otra persona."
      />

      <Select
        name="roleCode"
        label="Rol"
        required
        opciones={roles}
        errors={estado.fieldErrors?.['roleCode']}
        hint="Solo aparecen los roles cuyos permisos ya tienes. No puedes otorgar lo que no posees."
      />

      <Select
        name="legalEntityId"
        label="Entidad jurídica"
        opciones={entidades}
        errors={estado.fieldErrors?.['legalEntityId']}
        hint="Déjalo en blanco si el nombramiento no se acota a una entidad."
        vacio="Sin acotar a una entidad"
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Territorio</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Sin seleccionar nada, el nombramiento no tiene límite territorial. Marca una o varias unidades para acotarlo.
        </p>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-line)] p-3">
          {territorios.map((territorio) => (
            <label key={territorio.value} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="territorialUnitIds" value={territorio.value} className="size-4" />
              <span>{territorio.label}</span>
            </label>
          ))}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="includesDescendants" value="si" defaultChecked className="size-4" />
          <span>Alcanza también a las unidades por debajo de las seleccionadas</span>
        </label>
      </fieldset>

      <Field
        name="endsAt"
        label="Vence el"
        type="date"
        hint="Opcional. Al llegar la fecha, el nombramiento deja de conceder acceso sin que nadie intervenga."
        errors={estado.fieldErrors?.['endsAt']}
      />

      <Field
        name="reason"
        label="Motivo del nombramiento"
        required
        hint="Queda escrito en la bitácora. Al menos diez caracteres: escribe por qué, no qué."
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar nombramiento'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Registrando el nombramiento' : ''}
      </p>
    </form>
  );
}

/** Revocación en línea, con el motivo obligatorio junto al nombramiento. */
export function RevokeForm({ assignmentId, personName }: { assignmentId: string; personName: string }) {
  const [estado, accion, pendiente] = useActionState(revokeRoleAction, INICIAL);

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <label htmlFor={`motivo-${assignmentId}`} className="block text-sm font-medium">
        Motivo para revocar el nombramiento de {personName}
      </label>
      <input
        id={`motivo-${assignmentId}`}
        name="reason"
        required
        className="min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
        aria-invalid={estado.status === 'error'}
      />
      {estado.status === 'error' && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {estado.message}
        </p>
      )}
      {estado.status === 'ok' && (
        <p role="status" className="text-sm">
          {estado.message}
        </p>
      )}
      <SubmitButton variant="danger">{pendiente ? 'Revocando…' : 'Revocar'}</SubmitButton>
    </form>
  );
}

function Select({
  name,
  label,
  opciones,
  hint,
  errors,
  required = false,
  vacio,
}: {
  name: string;
  label: string;
  opciones: readonly Opcion[];
  hint?: string | undefined;
  errors?: readonly string[] | undefined;
  required?: boolean | undefined;
  vacio?: string | undefined;
}) {
  const hintId = hint === undefined ? undefined : `${name}-ayuda`;
  const errorId = errors === undefined || errors.length === 0 ? undefined : `${name}-error`;
  const describedBy = [hintId, errorId].filter((valor) => valor !== undefined).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required && (
          <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (obligatorio)</span>}
      </label>
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-[var(--color-ink-soft)]">
          {hint}
        </p>
      )}
      <select
        id={name}
        name={name}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={errorId !== undefined}
        defaultValue=""
        className="min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
      >
        <option value="">{vacio ?? 'Elige una opción'}</option>
        {opciones.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </select>
      {errorId !== undefined && (
        <ul id={errorId} className="space-y-1 text-sm text-[var(--color-danger)]">
          {errors!.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
