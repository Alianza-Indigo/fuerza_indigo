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
// Se importa del dominio y no de la interfaz del módulo a propósito: este
// componente corre en el navegador, y la interfaz del módulo arrastra los casos
// de uso y con ellos la conexión a la base. El dominio es puro.
import {
  CLAVES_DE_REGLA,
  FORMA_DE_REGLA,
  MAYORIAS,
  NOMBRE_DE_MAYORIA,
  NOMBRE_DE_QUORUM,
  NOMBRE_DE_REGLA,
  QUORUMS,
  type NormativeRules,
} from '@/modules/governance/domain/normative-rules';
import {
  draftRuleSetAction,
  editRuleDraftAction,
  putRulesInForceAction,
  type RulesFormState,
} from './actions';

const INICIAL: RulesFormState = { status: 'idle' };

const OPCIONES_MAYORIA: readonly Option[] = MAYORIAS.map((valor) => ({
  value: valor,
  label: NOMBRE_DE_MAYORIA[valor],
}));

const OPCIONES_QUORUM: readonly Option[] = QUORUMS.map((valor) => ({
  value: valor,
  label: NOMBRE_DE_QUORUM[valor],
}));

/**
 * Campos de los umbrales estatutarios.
 *
 * Ningún campo es obligatorio en el formulario, y eso es deliberado: un
 * borrador puede estar incompleto, y dejarlo en blanco es la manera de decir
 * «el estatuto todavía no lo aporta». Lo que sí es obligatorio es completarlos
 * para poner la versión en vigor, y el caso de uso lo exige entonces.
 */
function CamposDeReglas({
  valores,
  errores,
}: {
  valores: Partial<Record<keyof NormativeRules, unknown>>;
  errores: Record<string, string[]> | undefined;
}) {
  return (
    <fieldset className="space-y-5">
      <legend className="text-base font-semibold">Umbrales estatutarios</legend>
      <p className="text-sm text-[var(--color-ink-soft)]">
        Deja en blanco lo que el estatuto todavía no aporte. Un campo vacío queda declarado como pendiente; un cero
        sería un número inventado.
      </p>
      {CLAVES_DE_REGLA.map((clave) => {
        const forma = FORMA_DE_REGLA[clave];
        const etiqueta = NOMBRE_DE_REGLA[clave];
        const valor = valores[clave];
        const camposErroneos = errores?.[`rules.${clave}`];

        if (forma === 'booleano') {
          return (
            <div key={clave}>
              <input type="hidden" name={`presente_${clave}`} value="si" />
              <Checkbox name={clave} label={etiqueta} defaultChecked={valor === true} errors={camposErroneos} />
            </div>
          );
        }

        if (forma === 'mayoria' || forma === 'quorum') {
          return (
            <Select
              key={clave}
              name={clave}
              label={etiqueta}
              options={forma === 'mayoria' ? OPCIONES_MAYORIA : OPCIONES_QUORUM}
              defaultValue={typeof valor === 'string' ? valor : ''}
              placeholder="Pendiente de los estatutos"
              errors={camposErroneos}
            />
          );
        }

        return (
          <Field
            key={clave}
            name={clave}
            label={etiqueta}
            type="number"
            inputMode="numeric"
            defaultValue={typeof valor === 'number' ? String(valor) : ''}
            errors={camposErroneos}
          />
        );
      })}
    </fieldset>
  );
}

function Pendientes({ missing }: { missing: readonly string[] | undefined }) {
  if (missing === undefined || missing.length === 0) return null;
  return (
    <Notice tone="warning" title="Falta por aportar">
      <ul className="list-inside list-disc space-y-1">
        {missing.map((nombre) => (
          <li key={nombre}>{nombre}</li>
        ))}
      </ul>
    </Notice>
  );
}

/** Redacción de una versión nueva. */
export function DraftRuleSetForm() {
  const [estado, accion, pendiente] = useActionState(draftRuleSetAction, INICIAL);

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo redactar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
      <Pendientes missing={estado.missing} />

      <Field
        name="version"
        label="Versión"
        required
        hint="Año, punto y número. Por ejemplo: 2026.2."
        errors={estado.fieldErrors?.['version']}
      />

      <CamposDeReglas valores={{}} errores={estado.fieldErrors} />

      <TextArea
        name="reason"
        label="Motivo de la reforma"
        required
        rows={3}
        hint="Queda en la bitácora. Escribe qué cambia y por qué."
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton>{pendiente ? 'Redactando…' : 'Redactar el borrador'}</SubmitButton>
    </form>
  );
}

/** Edición de un borrador. Solo se admite mientras la versión no rija. */
export function EditRuleDraftForm({
  ruleSetId,
  valores,
}: {
  ruleSetId: string;
  valores: Partial<Record<keyof NormativeRules, unknown>>;
}) {
  const [estado, accion, pendiente] = useActionState(editRuleDraftAction, INICIAL);

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name="ruleSetId" value={ruleSetId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
      <Pendientes missing={estado.missing} />

      <CamposDeReglas valores={valores} errores={estado.fieldErrors} />

      <TextArea
        name="reason"
        label="Motivo del cambio"
        required
        rows={3}
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Guardando…' : 'Guardar el borrador'}</SubmitButton>
    </form>
  );
}

/** Puesta en vigor. Exige el acuerdo de asamblea que aprobó la reforma. */
export function PutInForceForm({
  ruleSetId,
  version,
  acuerdos,
  completa,
}: {
  ruleSetId: string;
  version: string;
  acuerdos: readonly Option[];
  completa: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(putRulesInForceAction, INICIAL);

  if (!completa) {
    return (
      <Notice tone="warning" title={`La versión ${version} todavía no puede entrar en vigor`}>
        <p>Le faltan umbrales que la plataforma necesita para decidir. Complétalos en el borrador.</p>
      </Notice>
    );
  }

  if (acuerdos.length === 0) {
    return (
      <Notice tone="warning" title="No hay ninguna resolución aprobada">
        <p>Una reforma estatutaria entra en vigor por acuerdo de asamblea. Sin el acuerdo, no hay reforma.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="ruleSetId" value={ruleSetId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo poner en vigor'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field
        name="effectiveFrom"
        label="Entra en vigor el"
        type="date"
        required
        hint="La versión anterior queda superada la víspera: no hay un día con dos vigentes ni un día sin ninguna."
        errors={estado.fieldErrors?.['effectiveFrom']}
      />
      <Select
        name="approvedByResolutionId"
        label="Acuerdo que la aprobó"
        required
        options={acuerdos}
        errors={estado.fieldErrors?.['approvedByResolutionId']}
      />
      <TextArea name="reason" label="Motivo" required rows={2} errors={estado.fieldErrors?.['reason']} />

      <SubmitButton>{pendiente ? 'Poniendo en vigor…' : `Poner en vigor la versión ${version}`}</SubmitButton>
    </form>
  );
}
