'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { archiveProductAction, reactivateProductAction, type CatalogState } from '../actions';

const INICIAL: CatalogState = { status: 'idle' };

/**
 * Retirar un concepto del catálogo, o devolverlo.
 *
 * Las dos operaciones piden motivo escrito, y por la misma razón: quien revise
 * las cuentas dentro de un año va a encontrarse con que un concepto dejó de
 * cobrarse en marzo, y el motivo es lo único que le explica por qué.
 *
 * Nunca se borra. Hay cobros que apuntan a los precios de este concepto.
 */
export function LifecycleForm({ productId, archivado }: { productId: string; archivado: boolean }) {
  const [estado, accion, pendiente] = useActionState(
    archivado ? reactivateProductAction : archiveProductAction,
    INICIAL,
  );
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name="productId" value={productId} />

      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Hecho'} />}

      <TextArea
        name="reason"
        label={archivado ? '¿Por qué vuelve a cobrarse?' : '¿Por qué se retira?'}
        hint={
          archivado
            ? 'Queda en la bitácora junto a tu nombre y la fecha.'
            : 'Queda en la bitácora. Sus precios y sus cobros anteriores no se tocan.'
        }
        required
        rows={3}
        maxLength={400}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton variant={archivado ? 'secondary' : 'danger'}>
        {pendiente
          ? archivado
            ? 'Devolviendo…'
            : 'Retirando…'
          : archivado
            ? 'Devolver al catálogo'
            : 'Retirar del catálogo'}
      </SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Guardando' : ''}
      </p>
    </form>
  );
}
