'use client';

import { useActionState, useState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Field,
  Notice,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  createMembershipTypeAction,
  updateMembershipTypeAction,
  type CalidadFormState,
} from './actions';

const INICIAL: CalidadFormState = { status: 'idle' };

const CATEGORIAS: readonly Option[] = [
  {
    value: 'UNION_MEMBER',
    label: 'Agremiada — calidad sindical',
    hint: 'Puede conceder voz y voto, computar para el quórum y aparecer ante la autoridad laboral.',
  },
  {
    value: 'HONORARY_AFFILIATE',
    label: 'Honoraria — sin derechos políticos sindicales',
    hint: 'Nunca vota, nunca computa para el quórum y nunca aparece como agremiada ante autoridades.',
  },
];

export interface ValoresDeCalidad {
  readonly membershipTypeId: string;
  readonly name: string;
  readonly benefitsSummary: string;
  readonly requiresHumanReview: boolean;
  readonly requiresPayment: boolean;
  readonly renewable: boolean;
  readonly isActive: boolean;
  readonly catalogProductId: string;
  readonly durationMonths: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
}

/**
 * Alta y edición de una calidad de membresía (PRD §3.2, §3.3).
 *
 * Al editar **no** se ofrecen la categoría ni los derechos políticos, y no es
 * una omisión: cambiarlos daría el voto, hacia atrás, a todas las membresías
 * vivas de ese tipo. Una calidad distinta es una calidad nueva.
 */
export function QualityForm({
  entidades,
  conceptos,
  valores,
}: {
  entidades: readonly Option[];
  conceptos: readonly Option[];
  valores?: ValoresDeCalidad | undefined;
}) {
  const editando = valores !== undefined;
  const [estado, accion, pendiente] = useActionState(
    editando ? updateMembershipTypeAction : createMembershipTypeAction,
    INICIAL,
  );
  const [categoria, setCategoria] = useState('UNION_MEMBER');
  const honoraria = categoria === 'HONORARY_AFFILIATE';

  const dato = (campo: keyof ValoresDeCalidad): string | undefined =>
    estado.values?.[campo] ?? (valores === undefined ? undefined : String(valores[campo]));

  const casilla = (campo: keyof ValoresDeCalidad, porOmision: boolean): boolean =>
    estado.values === undefined ? (valores === undefined ? porOmision : Boolean(valores[campo])) : estado.values[campo] === 'si';

  const clave = estado.status === 'idle' ? 'inicial' : JSON.stringify(estado.values ?? {});

  return (
    <form action={accion} className="space-y-6">
      {editando && <input type="hidden" name="membershipTypeId" value={valores.membershipTypeId} />}

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Guardado'} />}

      <div key={clave} className="space-y-6">
        {!editando && (
          <>
            <Field
              name="code"
              label="Código"
              required
              hint="Mayúsculas, números y guiones bajos. Por ejemplo: AGREMIADO_JUBILADO."
              defaultValue={dato('code' as keyof ValoresDeCalidad)}
              errors={estado.fieldErrors?.['code']}
            />
            <Select
              name="legalEntityId"
              label="Entidad jurídica"
              required
              hint="Quién concede esta calidad. Determina también por qué cuenta se cobra."
              options={entidades}
              defaultValue={dato('legalEntityId' as keyof ValoresDeCalidad)}
              errors={estado.fieldErrors?.['legalEntityId']}
            />
            <RadioGroup
              name="category"
              legend="Categoría"
              help="No se puede cambiar después: una calidad distinta es una calidad nueva."
              options={CATEGORIAS}
              value={categoria}
              onChange={setCategoria}
              errors={estado.fieldErrors?.['category']}
            />
          </>
        )}

        <Field
          name="name"
          label="Nombre"
          required
          defaultValue={dato('name')}
          errors={estado.fieldErrors?.['name']}
        />
        <TextArea
          name="benefitsSummary"
          label="Qué da esta calidad"
          required
          rows={4}
          hint="Es lo que leerá quien se afilie. En lenguaje claro."
          defaultValue={dato('benefitsSummary')}
          errors={estado.fieldErrors?.['benefitsSummary']}
        />

        {!editando && (
          <fieldset className="space-y-3 rounded-lg border border-[var(--color-line)] p-4">
            <legend className="px-1 text-sm font-semibold">Derechos que concede</legend>
            {honoraria ? (
              <Notice tone="neutral" title="Una calidad honoraria no concede derechos políticos sindicales">
                <p>
                  No vota, no computa para el quórum y no aparece como agremiada ante autoridades. No es una
                  casilla que se pueda marcar: la base de datos rechaza la fila (PRD §3.3).
                </p>
              </Notice>
            ) : (
              <>
                <Checkbox
                  name="grantsPoliticalRights"
                  label="Concede voz y voto"
                  help="Solo mientras la persona esté en pleno goce de derechos."
                />
                <Checkbox name="countsForQuorum" label="Computa para el quórum" />
                <Checkbox
                  name="appearsInAuthorityRoster"
                  label="Aparece en el padrón que se remite a la autoridad laboral"
                />
              </>
            )}
          </fieldset>
        )}

        <fieldset className="space-y-3 rounded-lg border border-[var(--color-line)] p-4">
          <legend className="px-1 text-sm font-semibold">Trámite y vigencia</legend>
          <Checkbox
            name="requiresHumanReview"
            label="Exige revisión humana antes de resolver"
            help="La admisión de agremiados siempre la exige (PRD §3.2)."
            defaultChecked={casilla('requiresHumanReview', true)}
          />
          <Checkbox
            name="requiresPayment"
            label="Exige pago para activarse"
            help="Si la marcas, elige abajo con qué concepto se cobra."
            defaultChecked={casilla('requiresPayment', false)}
          />
          <Checkbox name="renewable" label="Es renovable" defaultChecked={casilla('renewable', true)} />
          <Checkbox
            name="isActive"
            label="Está disponible para nuevas solicitudes"
            defaultChecked={casilla('isActive', true)}
          />
        </fieldset>

        <Select
          name="catalogProductId"
          label="Concepto del catálogo con el que se cobra"
          hint="Opcional. El importe lo fija el catálogo de cobros, no esta pantalla."
          options={conceptos}
          defaultValue={dato('catalogProductId') ?? ''}
          placeholder="Sin costo"
          errors={estado.fieldErrors?.['catalogProductId']}
        />
        <Field
          name="durationMonths"
          label="Vigencia en meses"
          hint="Opcional. Vacío significa vigente mientras no se dé de baja."
          inputMode="numeric"
          defaultValue={dato('durationMonths') ?? ''}
          errors={estado.fieldErrors?.['durationMonths']}
        />
        <Field
          name="effectiveFrom"
          label="Rige desde"
          type="date"
          required
          defaultValue={dato('effectiveFrom')}
          errors={estado.fieldErrors?.['effectiveFrom']}
        />
        <Field
          name="effectiveTo"
          label="Rige hasta"
          type="date"
          hint="Opcional."
          defaultValue={dato('effectiveTo') ?? ''}
          errors={estado.fieldErrors?.['effectiveTo']}
        />
      </div>

      <SubmitButton>{pendiente ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear calidad'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Guardando' : ''}
      </p>
    </form>
  );
}
