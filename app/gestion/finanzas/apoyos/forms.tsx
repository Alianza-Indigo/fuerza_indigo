'use client';

import { useActionState } from 'react';
import {
  Disclosure,
  ErrorNotice,
  Field,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import {
  approveScholarshipAction,
  grantDiscountAction,
  revokeDiscountAction,
  revokeScholarshipAction,
  type ApoyosState,
} from './actions';

const INICIAL: ApoyosState = { status: 'idle' };

export interface Opcion {
  readonly id: string;
  readonly label: string;
}

/**
 * Alta de un descuento.
 *
 * El campo del valor significa cosas distintas según el tipo, y eso se dice en
 * su texto de ayuda en vez de cambiar el campo al vuelo: sin JavaScript, un
 * campo que aparece y desaparece deja el formulario incompleto (misma razón que
 * en el alta de conceptos del catálogo).
 */
export function GrantDiscountForm({
  entidades,
  conceptos,
}: {
  entidades: readonly Opcion[];
  conceptos: readonly Opcion[];
}) {
  const [estado, accion, pendiente] = useActionState(grantDiscountAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Otorgado'} />}

      <Select
        name="legalEntityId"
        label="¿Qué entidad renuncia a este ingreso?"
        required
        options={entidades.map((entidad) => ({ value: entidad.id, label: entidad.label }))}
        {...(entidades.length === 1 ? { defaultValue: entidades[0]?.id } : {})}
        {...(errores['legalEntityId'] === undefined ? {} : { errors: errores['legalEntityId'] })}
      />

      <Field
        name="name"
        label="Nombre"
        hint="Como se explicará en las cuentas. Por ejemplo: convenio con el Sindicato de Telefonistas."
        required
        {...(errores['name'] === undefined ? {} : { errors: errores['name'] })}
      />

      <Field
        name="code"
        label="Código para quien lo use (opcional)"
        hint="Solo si se va a repartir como cupón. En mayúsculas, sin espacios."
        {...(errores['code'] === undefined ? {} : { errors: errores['code'] })}
      />

      <RadioGroup
        name="kind"
        legend="¿Cómo descuenta?"
        options={[
          { value: 'PERCENTAGE', label: 'Un porcentaje', hint: 'De 1 a 99. Escribe solo el número.' },
          { value: 'FIXED_AMOUNT', label: 'Una cantidad fija', hint: 'En pesos y centavos. Por ejemplo: 150.00.' },
          { value: 'FULL_WAIVER', label: 'Exención total', hint: 'No se cobra nada. El campo de abajo se ignora.' },
        ]}
        value="PERCENTAGE"
        {...(errores['kind'] === undefined ? {} : { errors: errores['kind'] })}
      />

      <Field
        name="value"
        label="Cuánto descuenta"
        hint="Un número entero si es porcentaje; pesos y centavos si es cantidad fija. En una exención total, déjalo vacío."
        inputMode="numeric"
        {...(errores['value'] === undefined ? {} : { errors: errores['value'] })}
      />

      <fieldset>
        <legend className="font-medium">¿A qué conceptos alcanza?</legend>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Sin marcar ninguno, alcanza a todos los conceptos de la entidad.
        </p>
        <div className="mt-3 grid gap-2">
          {conceptos.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">
              Todavía no hay conceptos en el catálogo de tu entidad.
            </p>
          ) : (
            conceptos.map((concepto) => (
              <label
                key={concepto.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2"
              >
                <input
                  type="checkbox"
                  name="productIds"
                  value={concepto.id}
                  className="size-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span>{concepto.label}</span>
              </label>
            ))
          )}
        </div>
      </fieldset>

      <Field
        name="maxRedemptions"
        label="¿Cuántas veces se puede usar? (opcional)"
        hint="Déjalo vacío para que no tenga límite."
        inputMode="numeric"
        {...(errores['maxRedemptions'] === undefined ? {} : { errors: errores['maxRedemptions'] })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="validFrom"
          type="date"
          label="Rige desde"
          required
          {...(errores['validFrom'] === undefined ? {} : { errors: errores['validFrom'] })}
        />
        <Field
          name="validTo"
          type="date"
          label="Hasta (opcional)"
          {...(errores['validTo'] === undefined ? {} : { errors: errores['validTo'] })}
        />
      </div>

      <TextArea
        name="reason"
        label="Motivo"
        hint="De qué acuerdo o convenio sale. Queda en la bitácora con tu nombre."
        required
        rows={3}
        maxLength={400}
      />

      <SubmitButton>{pendiente ? 'Otorgando…' : 'Otorgar el descuento'}</SubmitButton>
    </form>
  );
}

export function RevokeDiscountForm({ discountGrantId }: { discountGrantId: string }) {
  const [estado, accion, pendiente] = useActionState(revokeDiscountAction, INICIAL);

  return (
    <Disclosure summary="Retirar este descuento">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="discountGrantId" value={discountGrantId} />
        {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
        {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Retirado'} />}
        <TextArea
          name="reason"
          label="¿Por qué se retira?"
          hint="No se borra: los cobros que ya lo usaron siguen apuntando a él."
          required
          rows={2}
          maxLength={400}
        />
        <SubmitButton variant="danger">{pendiente ? 'Retirando…' : 'Retirar'}</SubmitButton>
      </form>
    </Disclosure>
  );
}

export function ApproveScholarshipForm({ entidades }: { entidades: readonly Opcion[] }) {
  const [estado, accion, pendiente] = useActionState(approveScholarshipAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Aprobada'} />}

      <Select
        name="legalEntityId"
        label="¿Qué entidad la otorga?"
        required
        options={entidades.map((entidad) => ({ value: entidad.id, label: entidad.label }))}
        {...(entidades.length === 1 ? { defaultValue: entidades[0]?.id } : {})}
        {...(errores['legalEntityId'] === undefined ? {} : { errors: errores['legalEntityId'] })}
      />

      <Field
        name="personId"
        label="Identificador de la persona"
        hint="El del registro maestro de quien recibe la beca."
        required
        {...(errores['personId'] === undefined ? {} : { errors: errores['personId'] })}
      />

      <Select
        name="programKind"
        label="¿Para qué programa?"
        hint="Una beca de un programa no rebaja los cobros de otro."
        required
        options={[
          { value: 'MEMBERSHIP', label: 'Cuotas y membresía' },
          { value: 'CIAN_SERVICE', label: 'Servicios del CIAN' },
          { value: 'COURSE', label: 'Cursos y programas formativos' },
          { value: 'TOOL_ACCESS', label: 'Acceso a herramientas' },
        ]}
        {...(errores['programKind'] === undefined ? {} : { errors: errores['programKind'] })}
      />

      <Field
        name="coveragePercent"
        label="¿Qué porcentaje cubre?"
        hint="De 1 a 100. Cien es exención total: no se le cobra nada."
        inputMode="numeric"
        required
        {...(errores['coveragePercent'] === undefined ? {} : { errors: errores['coveragePercent'] })}
      />

      <TextArea
        name="justification"
        label="Justificación"
        hint="Es lo que respalda la beca ante quien revise las cuentas. No sale de aquí: no va a la bitácora general, porque dice algo sobre la situación de una persona."
        required
        rows={5}
        maxLength={4000}
        {...(errores['justification'] === undefined ? {} : { errors: errores['justification'] })}
      />

      <Field
        name="evidenceFileIds"
        label="Identificador de la evidencia (opcional)"
        hint="El del archivo ya subido al expediente. Puedes añadir más después."
        {...(errores['evidenceFileIds'] === undefined ? {} : { errors: errores['evidenceFileIds'] })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="validFrom"
          type="date"
          label="Rige desde"
          required
          {...(errores['validFrom'] === undefined ? {} : { errors: errores['validFrom'] })}
        />
        <Field
          name="validTo"
          type="date"
          label="Hasta (opcional)"
          {...(errores['validTo'] === undefined ? {} : { errors: errores['validTo'] })}
        />
      </div>

      <SubmitButton>{pendiente ? 'Aprobando…' : 'Aprobar la beca'}</SubmitButton>
    </form>
  );
}

export function RevokeScholarshipForm({ scholarshipId }: { scholarshipId: string }) {
  const [estado, accion, pendiente] = useActionState(revokeScholarshipAction, INICIAL);

  return (
    <Disclosure summary="Retirar esta beca">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="scholarshipId" value={scholarshipId} />
        {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
        {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Retirada'} />}
        <TextArea
          name="reason"
          label="¿Por qué se retira?"
          hint="Queda en el expediente. Lo que ya se cobró con ella no cambia."
          required
          rows={2}
          maxLength={400}
        />
        <SubmitButton variant="danger">{pendiente ? 'Retirando…' : 'Retirar'}</SubmitButton>
      </form>
    </Disclosure>
  );
}
