'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, Select, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { createPriceAction, type CatalogState } from '../actions';

const INICIAL: CatalogState = { status: 'idle' };

/**
 * Alta de una versión de precio.
 *
 * Pide pesos con centavos, no centavos. La conversión ocurre en un solo sitio
 * —la acción del servidor— y ahí está probada (ADR-0049). Pedirle a alguien que
 * escriba «15000» para decir ciento cincuenta pesos es pedirle que haga la
 * conversión a mano, y tarde o temprano alguien la hace al revés.
 */
export function PriceForm({
  productId,
  recurrente,
  hoy,
}: {
  productId: string;
  recurrente: boolean;
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(createPriceAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name="productId" value={productId} />

      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Registrada'} />}

      <Field
        name="amount"
        label="Importe"
        hint="En pesos y centavos, como se dice en voz alta. Por ejemplo: 150.00."
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
        {...(errores['currency'] === undefined ? {} : { errors: errores['currency'] })}
      />

      {recurrente ? (
        <Select
          name="interval"
          label="¿Cada cuánto se cobra?"
          required
          options={[
            { value: 'MONTH', label: 'Cada mes' },
            { value: 'QUARTER', label: 'Cada tres meses' },
            { value: 'SEMESTER', label: 'Cada seis meses' },
            { value: 'YEAR', label: 'Cada año' },
          ]}
          {...(errores['interval'] === undefined ? {} : { errors: errores['interval'] })}
        />
      ) : (
        // No es un campo escondido: este concepto es de pago único y una
        // periodicidad lo cobraría para siempre. El caso de uso rechaza el
        // envío que la traiga, aunque llegue por otro camino.
        <p className="text-sm text-[var(--color-ink-soft)]">
          Este concepto es de pago único, así que no lleva periodicidad.
        </p>
      )}

      <Field
        name="effectiveFrom"
        type="date"
        label="¿Desde qué día rige?"
        hint="La versión anterior queda cerrada ese mismo día. Los cobros hechos antes conservan el precio con el que se cobraron."
        defaultValue={hoy}
        required
        {...(errores['effectiveFrom'] === undefined ? {} : { errors: errores['effectiveFrom'] })}
      />

      <Field
        name="stripePriceId"
        label="Identificador en la pasarela (opcional)"
        hint="Si este importe ya existe en la cuenta de cobro, pega aquí su identificador."
        {...(errores['stripePriceId'] === undefined ? {} : { errors: errores['stripePriceId'] })}
      />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar esta versión del precio'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Registrando la versión del precio' : ''}
      </p>
    </form>
  );
}
