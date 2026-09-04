'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, SubmitButton, SuccessNotice, TextArea, Select } from '@/design-system/primitives';
import { exportLedgerAction, type ExportState } from './actions';

const INICIAL: ExportState = { status: 'idle' };

/**
 * Exportación del libro.
 *
 * El archivo llega en la respuesta de la acción y se ofrece como descarga desde
 * el navegador. No existe una dirección de descarga reutilizable a propósito:
 * una dirección así se copia, se comparte y acaba entregando el libro a quien
 * nadie autorizó, sin que quede rastro de esa segunda entrega.
 */
export function ExportLedgerForm({
  entidades,
  desde,
  hasta,
}: {
  entidades: readonly { id: string; label: string }[];
  desde: string;
  hasta: string;
}) {
  const [estado, accion, pendiente] = useActionState(exportLedgerAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  const enlace =
    estado.status === 'ok' && estado.content !== undefined
      ? `data:text/csv;charset=utf-8,${encodeURIComponent(estado.content)}`
      : null;

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Exportado'} />}

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
          defaultValue={desde}
          required
          {...(errores['periodStart'] === undefined ? {} : { errors: errores['periodStart'] })}
        />
        <Field
          name="periodEnd"
          type="date"
          label="Hasta"
          defaultValue={hasta}
          required
          {...(errores['periodEnd'] === undefined ? {} : { errors: errores['periodEnd'] })}
        />
      </div>

      <TextArea
        name="reason"
        label="¿Para qué se exporta?"
        hint="Queda en la bitácora junto a tu nombre y la hora. Un archivo con los movimientos de dinero de la organización no sale sin que conste quién se lo llevó y para qué."
        required
        rows={3}
        maxLength={400}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Preparando…' : 'Exportar el libro'}</SubmitButton>

      {enlace !== null && estado.fileName !== undefined && (
        <p>
          <a
            href={enlace}
            download={estado.fileName}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-medium text-[var(--color-ink-inverse)] hover:bg-[var(--color-accent-hover)]"
          >
            Descargar {estado.fileName}
          </a>
        </p>
      )}
    </form>
  );
}
