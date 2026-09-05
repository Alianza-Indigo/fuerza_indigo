'use client';

import { useActionState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Field,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  createUnionBodyAction,
  declareIncompatibilityAction,
  defineOfficeAction,
  type GovernanceFormState,
} from './actions';

const INICIAL: GovernanceFormState = { status: 'idle' };

const ORGANOS: readonly Option[] = [
  { value: 'GENERAL_ASSEMBLY', label: 'Asamblea General' },
  { value: 'NATIONAL_EXECUTIVE_COMMITTEE', label: 'Comité Ejecutivo Nacional' },
  { value: 'OVERSIGHT_COMMISSION', label: 'Comisión de Vigilancia y Fiscalización' },
  { value: 'ELECTORAL_COMMISSION', label: 'Comisión Electoral' },
  { value: 'SECTION_DELEGATION', label: 'Delegación seccional' },
  { value: 'TEMPORARY_COMMISSION', label: 'Comisión temporal' },
];

const CARGOS: readonly Option[] = [
  { value: 'SECRETARY_GENERAL', label: 'Secretaría General' },
  { value: 'SECRETARY_ORGANIZATION', label: 'Secretaría de Organización' },
  { value: 'SECRETARY_LABOR_DISPUTES', label: 'Secretaría de Trabajo y Conflictos' },
  { value: 'SECRETARY_FINANCE', label: 'Secretaría de Finanzas y Tesorería' },
  { value: 'SECRETARY_MINUTES', label: 'Secretaría de Actas y Acuerdos' },
  { value: 'SECRETARY_NEUROINCLUSION', label: 'Secretaría de Neuroinclusión y Enlace Familiar' },
  { value: 'SECRETARY_GENDER_EQUITY', label: 'Secretaría de Equidad y Género' },
  { value: 'SECRETARY_PRESS', label: 'Secretaría de Prensa y Propaganda' },
  { value: 'ADDITIONAL_SECRETARY', label: 'Secretaría adicional' },
  { value: 'OVERSIGHT_MEMBER', label: 'Integrante de la Comisión de Vigilancia' },
  { value: 'ELECTORAL_MEMBER', label: 'Integrante de la Comisión Electoral' },
  { value: 'SECTION_DELEGATE', label: 'Delegación seccional' },
  { value: 'COMMISSION_MEMBER', label: 'Integrante de comisión temporal' },
];

const ROLES: readonly Option[] = [
  { value: 'EXECUTIVE_SECRETARY', label: 'Secretaría Ejecutiva — gestión institucional' },
  { value: 'TERRITORIAL_DELEGATE', label: 'Delegación territorial — alcance de su unidad' },
  { value: 'OVERSIGHT_COMMISSION', label: 'Comisión de Vigilancia — revisión independiente' },
  { value: 'ELECTORAL_COMMISSION', label: 'Comisión Electoral — proceso electoral' },
];

/** Instalación de un órgano de gobierno. */
export function CreateBodyForm({
  territorios,
  entidades,
}: {
  territorios: readonly Option[];
  entidades: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(createUnionBodyAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo instalar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field name="name" label="Nombre" required errors={estado.fieldErrors?.['name']} />
      <Field
        name="code"
        label="Código"
        required
        hint="Mayúsculas, números y guiones bajos. Por ejemplo: CEN_NACIONAL."
        errors={estado.fieldErrors?.['code']}
      />
      <Select name="kind" label="Tipo de órgano" required options={ORGANOS} errors={estado.fieldErrors?.['kind']} />
      <Select
        name="territorialUnitId"
        label="Unidad territorial"
        required
        options={territorios}
        errors={estado.fieldErrors?.['territorialUnitId']}
      />
      <Select
        name="legalEntityId"
        label="Entidad jurídica"
        required
        options={entidades}
        errors={estado.fieldErrors?.['legalEntityId']}
      />
      <Field
        name="installedOn"
        label="Instalado el"
        type="date"
        hint="Opcional mientras el órgano esté acordado pero no instalado."
        errors={estado.fieldErrors?.['installedOn']}
      />

      <SubmitButton>{pendiente ? 'Instalando…' : 'Instalar el órgano'}</SubmitButton>
    </form>
  );
}

/** Definición de un cargo con sus facultades. */
export function DefineOfficeForm({
  organos,
  permisos,
}: {
  organos: readonly Option[];
  permisos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(defineOfficeAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo definir'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field name="name" label="Nombre del cargo" required errors={estado.fieldErrors?.['name']} />
      <Field
        name="code"
        label="Código"
        required
        hint="Por ejemplo: SECRETARIA_GENERAL."
        errors={estado.fieldErrors?.['code']}
      />
      <Select
        name="unionBodyId"
        label="Órgano al que pertenece"
        required
        options={organos}
        errors={estado.fieldErrors?.['unionBodyId']}
      />
      <Select name="kind" label="Cartera" required options={CARGOS} errors={estado.fieldErrors?.['kind']} />
      <Field
        name="termMonths"
        label="Duración del periodo (meses)"
        type="number"
        inputMode="numeric"
        required
        hint="El valor que fije la versión de reglas estatutarias en vigor."
        errors={estado.fieldErrors?.['termMonths']}
      />
      <Field
        name="seats"
        label="Plazas"
        type="number"
        inputMode="numeric"
        defaultValue="1"
        hint="Una para cada secretaría; tres para las comisiones de Vigilancia y Electoral."
        errors={estado.fieldErrors?.['seats']}
      />
      <Checkbox
        name="reelectionAllowed"
        label="Se admite la reelección en este cargo"
        help="Conforme a la versión de reglas estatutarias en vigor."
        errors={estado.fieldErrors?.['reelectionAllowed']}
      />
      <Select
        name="grantsRoleCode"
        label="Rol base que concede"
        required
        options={ROLES}
        hint="El acceso vive atado al periodo: al vencer el cargo, se retira solo."
        errors={estado.fieldErrors?.['grantsRoleCode']}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Facultades del cargo
          <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (obligatorio)</span>
        </legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Un cargo sin facultades no abre ninguna puerta. Elige al menos una.
        </p>
        {estado.fieldErrors?.['permissionCodes'] !== undefined && (
          <ul className="space-y-1 text-sm text-[var(--color-danger)]">
            {estado.fieldErrors['permissionCodes'].map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}
        <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-line)] p-3">
          {permisos.map((permiso) => (
            <label key={permiso.value} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="permissionCodes" value={permiso.value} className="size-4" />
              <span>{permiso.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <SubmitButton>{pendiente ? 'Definiendo…' : 'Definir el cargo'}</SubmitButton>
    </form>
  );
}

/** Declaración de incompatibilidad entre dos cargos. */
export function IncompatibilityForm({ cargos }: { cargos: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(declareIncompatibilityAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo declarar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Select name="officeAId" label="Cargo" required options={cargos} errors={estado.fieldErrors?.['officeAId']} />
      <Select
        name="officeBId"
        label="Incompatible con"
        required
        options={cargos}
        errors={estado.fieldErrors?.['officeBId']}
      />
      <TextArea
        name="rationale"
        label="Por qué son incompatibles"
        required
        rows={2}
        hint="Es lo que leerá quien intente ocupar los dos."
        errors={estado.fieldErrors?.['rationale']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Declarando…' : 'Declarar la incompatibilidad'}</SubmitButton>
    </form>
  );
}
