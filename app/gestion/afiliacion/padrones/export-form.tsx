'use client';

import { useActionState } from 'react';
import { ErrorNotice, Notice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { exportRosterAction, type ExportacionState } from './actions';

const INICIAL: ExportacionState = { status: 'idle' };

/**
 * Exportar un padrón.
 *
 * El motivo es obligatorio y se dice por qué: lo que sale del sistema deja de
 * estar protegido por él. El aviso no es una advertencia decorativa —es la
 * única oportunidad de que quien exporta lo piense antes.
 *
 * La descarga se arma en el navegador a partir del contenido que devuelve la
 * acción, ya auditado en el servidor. Así no existe una dirección que descargue
 * el padrón entero con solo visitarla.
 */
export function ExportForm({ roster }: { roster: 'UNION' | 'HONORARY' | 'AUTHORITY' }) {
  const [estado, accion, pendiente] = useActionState(exportRosterAction, INICIAL);

  if (estado.status === 'ok' && estado.file !== undefined) {
    const descarga = `data:text/csv;charset=utf-8,${encodeURIComponent(estado.file.content)}`;
    return (
      <div className="space-y-3">
        <SuccessNotice title={estado.message ?? 'Padrón exportado'} />
        <a
          href={descarga}
          download={estado.file.name}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-line-strong)] px-5 font-medium underline underline-offset-4"
        >
          Descargar {estado.file.name}
        </a>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="roster" value={roster} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo exportar'} />}

      <TextArea
        name="reason"
        label="Para qué se va a usar"
        required
        rows={3}
        hint="Queda en la bitácora con tu nombre y la fecha."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />

      <Notice tone="warning" title="Lo que sale del sistema deja de estar protegido por él">
        <p>
          Un padrón exportado es una lista de personas en un archivo que se puede copiar, reenviar y perder.
          Expórtalo solo si de verdad hace falta fuera.
        </p>
      </Notice>

      <SubmitButton>{pendiente ? 'Exportando…' : 'Exportar el padrón'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Exportando' : ''}</p>
    </form>
  );
}
