'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, Select, SubmitButton, type Option } from '@/design-system/primitives';
import { disableSourceAction, indexSourceAction, registerSourceAction, type FuenteState } from './actions';

const INICIAL: FuenteState = { status: 'idle' };

const TIPOS: Option[] = [
  { value: 'STATUTE', label: 'Estatuto' },
  { value: 'POLICY', label: 'Política o reglamento' },
  { value: 'PROCEDURE_GUIDE', label: 'Guía de trámite' },
  { value: 'PUBLIC_CONTENT', label: 'Contenido público' },
];

export function RegisterSourceForm({ paginas, permisos }: { paginas: Option[]; permisos: Option[] }) {
  const [estado, accion, pendiente] = useActionState(registerSourceAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}
      <Field name="code" label="Código" required hint="Identificador estable. Por ejemplo: estatutos-generales." errors={estado.fieldErrors?.['code']} />
      <Field name="name" label="Nombre" required hint="Cómo se llama esta fuente en el listado." errors={estado.fieldErrors?.['name']} />
      <Select name="sourceKind" label="Tipo" required options={TIPOS} defaultValue="PUBLIC_CONTENT" errors={estado.fieldErrors?.['sourceKind']} />
      <Select
        name="contentPageId"
        label="Página del gestor"
        required
        options={paginas}
        placeholder="Elige la página que se indexa"
        hint="La fuente es una página del gestor de contenidos: sus estatutos, una guía de trámite."
        errors={estado.fieldErrors?.['contentPageId']}
      />
      <Select
        name="requiredPermissionCode"
        label="Permiso que exige"
        options={permisos}
        placeholder="Pública: cualquiera puede consultarla"
        hint="Si la eliges, solo quien tenga ese permiso recuperará sus fragmentos. En blanco significa pública, a propósito."
        errors={estado.fieldErrors?.['requiredPermissionCode']}
      />
      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar fuente'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Registrando' : ''}</p>
    </form>
  );
}

export function IndexButton({ sourceId }: { sourceId: string }) {
  const [estado, accion, pendiente] = useActionState(indexSourceAction, INICIAL);
  return (
    <form action={accion} className="inline">
      <input type="hidden" name="sourceId" value={sourceId} />
      <button type="submit" disabled={pendiente} className="text-sm underline underline-offset-4 disabled:opacity-60">
        {pendiente ? 'Indexando…' : 'Indexar'}
      </button>
      {estado.status === 'ok' && <span className="ml-2 text-xs text-[var(--color-ink-soft)]">{estado.message}</span>}
      {estado.status === 'error' && <span className="ml-2 text-xs text-[var(--color-danger)]">{estado.message}</span>}
    </form>
  );
}

export function DisableButton({ sourceId }: { sourceId: string }) {
  const [estado, accion, pendiente] = useActionState(disableSourceAction, INICIAL);
  return (
    <form action={accion} className="inline">
      <input type="hidden" name="sourceId" value={sourceId} />
      <button type="submit" disabled={pendiente} className="text-sm underline underline-offset-4 disabled:opacity-60">
        {pendiente ? 'Deshabilitando…' : 'Deshabilitar'}
      </button>
      {estado.status === 'error' && <span className="ml-2 text-xs text-[var(--color-danger)]">{estado.message}</span>}
    </form>
  );
}

