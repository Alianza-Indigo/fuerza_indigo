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
  approveManualPaymentAction,
  approveRefundAction,
  registerManualPaymentAction,
  rejectManualPaymentAction,
  rejectRefundAction,
  requestRefundAction,
  type PagosState,
} from './actions';

const INICIAL: PagosState = { status: 'idle' };

/**
 * Formularios de pagos manuales y devoluciones.
 *
 * Todos piden motivo escrito, y no por trámite: son los actos que mueven dinero
 * fuera de la pasarela, y el motivo es lo que los explica cuando alguien los
 * revise dentro de un año.
 */

export function RegisterManualPaymentForm({
  cuentas,
}: {
  cuentas: readonly { id: string; label: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(registerManualPaymentAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Registrado'} />}

      <Select
        name="billingAccountId"
        label="¿A nombre de quién entra?"
        hint="La cuenta de cobro de la persona u organización que pagó."
        required
        options={cuentas.map((cuenta) => ({ value: cuenta.id, label: cuenta.label }))}
        {...(errores['billingAccountId'] === undefined ? {} : { errors: errores['billingAccountId'] })}
      />

      <Field
        name="amount"
        label="Importe recibido"
        hint="En pesos y centavos, como aparece en el comprobante. Por ejemplo: 500.00."
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

      <RadioGroup
        name="method"
        legend="¿Cómo llegó el dinero?"
        options={[
          { value: 'MANUAL_TRANSFER', label: 'Transferencia' },
          { value: 'MANUAL_CASH', label: 'Efectivo' },
        ]}
        value="MANUAL_TRANSFER"
        {...(errores['method'] === undefined ? {} : { errors: errores['method'] })}
      />

      <Field
        name="receivedAt"
        type="date"
        label="¿Qué día se recibió?"
        required
        {...(errores['receivedAt'] === undefined ? {} : { errors: errores['receivedAt'] })}
      />

      <Field
        name="evidenceFileId"
        label="Identificador del comprobante"
        hint="El del archivo ya subido al expediente financiero de la entidad. Sin comprobante no se registra."
        required
        {...(errores['evidenceFileId'] === undefined ? {} : { errors: errores['evidenceFileId'] })}
      />

      <TextArea
        name="reason"
        label="Motivo"
        hint="Qué se está registrando y de dónde sale. Queda en la bitácora con tu nombre."
        required
        rows={3}
        maxLength={400}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar el pago recibido'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Registrando el pago' : ''}
      </p>
    </form>
  );
}

/** Aprobar o rechazar un pago manual. Una sola caja con las dos salidas. */
export function ResolveManualPaymentForm({ paymentId }: { paymentId: string }) {
  const [aprobar, accionAprobar, aprobando] = useActionState(approveManualPaymentAction, INICIAL);
  const [rechazar, accionRechazar, rechazando] = useActionState(rejectManualPaymentAction, INICIAL);

  const estado = aprobar.status !== 'idle' ? aprobar : rechazar;

  return (
    <div className="space-y-4">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Resuelto'} />}

      <Disclosure summary="Aprobar este pago">
        <form action={accionAprobar} className="space-y-4">
          <input type="hidden" name="paymentId" value={paymentId} />
          <TextArea
            name="reason"
            label="Motivo"
            hint="Cómo comprobaste que el dinero entró. Queda en la bitácora."
            required
            rows={2}
            maxLength={400}
          />
          <SubmitButton>{aprobando ? 'Aprobando…' : 'Aprobar'}</SubmitButton>
        </form>
      </Disclosure>

      <Disclosure summary="Rechazar este pago">
        <form action={accionRechazar} className="space-y-4">
          <input type="hidden" name="paymentId" value={paymentId} />
          <TextArea
            name="reason"
            label="Motivo del rechazo"
            hint="Lo va a leer quien lo registró. El registro no se borra: queda cancelado con su motivo."
            required
            rows={2}
            maxLength={400}
          />
          <SubmitButton variant="danger">{rechazando ? 'Rechazando…' : 'Rechazar'}</SubmitButton>
        </form>
      </Disclosure>
    </div>
  );
}

export function RequestRefundForm() {
  const [estado, accion, pendiente] = useActionState(requestRefundAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Solicitada'} />}

      <Field
        name="paymentId"
        label="Identificador interno del cobro"
        hint="El del cobro que se va a devolver."
        required
        {...(errores['paymentId'] === undefined ? {} : { errors: errores['paymentId'] })}
      />

      <Field
        name="amount"
        label="Importe a devolver (opcional)"
        hint="En pesos y centavos. Déjalo vacío para devolver todo lo que queda por devolver."
        inputMode="numeric"
        {...(errores['amount'] === undefined ? {} : { errors: errores['amount'] })}
      />

      <TextArea
        name="reason"
        label="¿Por qué se devuelve?"
        hint="Lo va a leer quien la apruebe y quien revise las cuentas. Explícalo con detalle."
        required
        rows={4}
        maxLength={2000}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Solicitando…' : 'Solicitar la devolución'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Solicitando la devolución' : ''}
      </p>
    </form>
  );
}

export function ResolveRefundForm({ refundId }: { refundId: string }) {
  const [aprobar, accionAprobar, aprobando] = useActionState(approveRefundAction, INICIAL);
  const [rechazar, accionRechazar, rechazando] = useActionState(rejectRefundAction, INICIAL);

  const estado = aprobar.status !== 'idle' ? aprobar : rechazar;

  return (
    <div className="space-y-4">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Resuelta'} />}

      <Disclosure summary="Aprobar y ejecutar">
        <form action={accionAprobar} className="space-y-4">
          <input type="hidden" name="refundId" value={refundId} />
          <TextArea
            name="reason"
            label="Motivo"
            hint="Por qué procede. Al aprobar, el dinero sale."
            required
            rows={2}
            maxLength={400}
          />
          <SubmitButton>{aprobando ? 'Aprobando…' : 'Aprobar y devolver'}</SubmitButton>
        </form>
      </Disclosure>

      <Disclosure summary="Rechazar">
        <form action={accionRechazar} className="space-y-4">
          <input type="hidden" name="refundId" value={refundId} />
          <TextArea
            name="reason"
            label="Motivo del rechazo"
            hint="Lo va a leer quien la pidió."
            required
            rows={2}
            maxLength={400}
          />
          <SubmitButton variant="danger">{rechazando ? 'Rechazando…' : 'Rechazar'}</SubmitButton>
        </form>
      </Disclosure>
    </div>
  );
}
