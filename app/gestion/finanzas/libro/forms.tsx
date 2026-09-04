'use client';

import { useActionState } from 'react';
import { Disclosure, ErrorNotice, Field, RadioGroup, Select, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import {
  closeReconciliationAction,
  postAdjustmentAction,
  reverseEntryAction,
  runReconciliationAction,
  type LibroState,
} from './actions';

const INICIAL: LibroState = { status: 'idle' };

export interface Opcion {
  readonly id: string;
  readonly label: string;
}

export function AdjustmentForm({
  entidades,
  cuentas,
  hoy,
}: {
  entidades: readonly Opcion[];
  cuentas: readonly Opcion[];
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(postAdjustmentAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Asentado'} />}

      <Select
        name="legalEntityId"
        label="Entidad"
        required
        options={entidades.map((entidad) => ({ value: entidad.id, label: entidad.label }))}
        {...(entidades.length === 1 ? { defaultValue: entidades[0]?.id } : {})}
        {...(errores['legalEntityId'] === undefined ? {} : { errors: errores['legalEntityId'] })}
      />

      <RadioGroup
        name="direction"
        legend="¿Entra o sale?"
        help="El sentido lo dice esta elección, no el signo del importe: un asiento con importe negativo diría dos cosas a la vez."
        options={[
          { value: 'CREDIT', label: 'Entra dinero' },
          { value: 'DEBIT', label: 'Sale dinero' },
        ]}
        value="CREDIT"
        {...(errores['direction'] === undefined ? {} : { errors: errores['direction'] })}
      />

      <Select
        name="accountCode"
        label="Cuenta"
        hint="Del catálogo auxiliar interno. No es un plan contable autorizado."
        required
        options={cuentas.map((cuenta) => ({ value: cuenta.id, label: cuenta.label }))}
        {...(errores['accountCode'] === undefined ? {} : { errors: errores['accountCode'] })}
      />

      <Field
        name="amount"
        label="Importe"
        hint="En pesos y centavos, siempre positivo."
        inputMode="numeric"
        required
        {...(errores['amount'] === undefined ? {} : { errors: errores['amount'] })}
      />

      <Select
        name="currency"
        label="Moneda"
        required
        defaultValue="MXN"
        options={[
          { value: 'MXN', label: 'Pesos mexicanos (MXN)' },
          { value: 'USD', label: 'Dólares estadounidenses (USD)' },
        ]}
      />

      <Field
        name="entryDate"
        type="date"
        label="Fecha del asiento"
        defaultValue={hoy}
        required
        {...(errores['entryDate'] === undefined ? {} : { errors: errores['entryDate'] })}
      />

      <Field
        name="description"
        label="Descripción"
        hint="Qué movimiento es. Aparece en el libro."
        required
        {...(errores['description'] === undefined ? {} : { errors: errores['description'] })}
      />

      <TextArea
        name="reason"
        label="¿De dónde sale este ajuste?"
        hint="Un ajuste sin motivo escrito es un descuadre disfrazado. Explícalo con detalle."
        required
        rows={3}
        maxLength={600}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Asentando…' : 'Asentar el ajuste'}</SubmitButton>
    </form>
  );
}

export function ReverseEntryForm({ entryId }: { entryId: string }) {
  const [estado, accion, pendiente] = useActionState(reverseEntryAction, INICIAL);

  return (
    <Disclosure summary="Revertir este asiento">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="entryId" value={entryId} />
        {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
        {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Revertido'} />}
        <TextArea
          name="reason"
          label="¿Qué estaba mal?"
          hint="El original no se toca. Se crea un asiento contrario que lo corrige, y los dos quedan a la vista."
          required
          rows={3}
          maxLength={600}
        />
        <SubmitButton variant="danger">{pendiente ? 'Revirtiendo…' : 'Revertir con un asiento nuevo'}</SubmitButton>
      </form>
    </Disclosure>
  );
}

export function RunReconciliationForm({ entidades }: { entidades: readonly Opcion[] }) {
  const [estado, accion, pendiente] = useActionState(runReconciliationAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Conciliado'} />}

      <Select
        name="legalEntityId"
        label="Entidad"
        required
        options={entidades.map((entidad) => ({ value: entidad.id, label: entidad.label }))}
        {...(entidades.length === 1 ? { defaultValue: entidades[0]?.id } : {})}
        {...(errores['legalEntityId'] === undefined ? {} : { errors: errores['legalEntityId'] })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="periodStart"
          type="date"
          label="Desde"
          required
          {...(errores['periodStart'] === undefined ? {} : { errors: errores['periodStart'] })}
        />
        <Field
          name="periodEnd"
          type="date"
          label="Hasta"
          hint="El último día cuenta entero."
          required
          {...(errores['periodEnd'] === undefined ? {} : { errors: errores['periodEnd'] })}
        />
      </div>

      <SubmitButton>{pendiente ? 'Conciliando…' : 'Correr el corte'}</SubmitButton>
    </form>
  );
}

export function CloseReconciliationForm({ reconciliationId, conDiferencias }: { reconciliationId: string; conDiferencias: boolean }) {
  const [estado, accion, pendiente] = useActionState(closeReconciliationAction, INICIAL);

  return (
    <Disclosure summary="Cerrar este corte">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="reconciliationId" value={reconciliationId} />
        {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
        {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Cerrado'} />}
        <TextArea
          name="note"
          label={conDiferencias ? '¿Qué se encontró y qué se va a hacer?' : 'Nota del cierre (opcional)'}
          hint={
            conDiferencias
              ? 'Este corte tiene diferencias. Cerrarlo así es legítimo —forzar un cuadre inventando un ajuste sería peor—, pero hay que decir qué pasó.'
              : 'El periodo cuadra. Puedes dejar constancia de cualquier cosa que convenga recordar.'
          }
          required={conDiferencias}
          rows={3}
          maxLength={600}
        />
        <SubmitButton variant="secondary">{pendiente ? 'Cerrando…' : 'Cerrar el corte'}</SubmitButton>
      </form>
    </Disclosure>
  );
}
