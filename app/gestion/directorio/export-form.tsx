'use client';

import { useActionState } from 'react';
import { ErrorNotice, Notice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { exportDirectoryAction, type DirectorioState } from './actions';

const INICIAL: DirectorioState = { status: 'idle' };

/**
 * Exportar el directorio interno.
 *
 * Lo que se exporta es **lo que quien exporta ve**, no el directorio entero: el
 * caso de uso vuelve a consultarlo con el mismo actor. Se dice aquí porque la
 * diferencia importa cuando alguien recibe el archivo y cree que es completo.
 */
export function ExportDirectoryForm() {
  const [estado, accion, pendiente] = useActionState(exportDirectoryAction, INICIAL);

  if (estado.status === 'ok' && estado.file !== undefined) {
    const descarga = `data:text/csv;charset=utf-8,${encodeURIComponent(estado.file.content)}`;
    return (
      <div className="space-y-3">
        <SuccessNotice title={estado.message ?? 'Directorio exportado'} />
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
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo exportar'} />}
      <TextArea
        name="reason"
        label="Para qué se va a usar"
        required
        rows={3}
        hint="Queda en la bitácora con tu nombre, la fecha y la hora."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />
      <Notice tone="warning" title="Sale con tu alcance, no con el de la organización">
        <p>
          El archivo contiene lo mismo que ves tú en pantalla. Si alguien lo recibe y cree que es el
          directorio completo, se equivoca.
        </p>
      </Notice>
      <SubmitButton>{pendiente ? 'Exportando…' : 'Exportar el directorio'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Exportando' : ''}</p>
    </form>
  );
}
