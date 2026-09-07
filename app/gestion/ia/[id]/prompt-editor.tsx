'use client';

import { useActionState } from 'react';
import {
  Badge,
  Card,
  Disclosure,
  ErrorNotice,
  Field,
  Notice,
  ScrollableTable,
  Section,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import type { PromptDetail, PromptVersionDetail } from '@/modules/ai';
import {
  labRunAction,
  publishAction,
  retireAction,
  retrievalTestAction,
  revertAction,
  saveDraftAction,
  setSourcesAction,
  type LabState,
  type PromptFormState,
  type RetrievalState,
} from '../actions';

interface Fuente {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly requiredPermissionCode: string | null;
}

const INICIAL: PromptFormState = { status: 'idle' };
const LAB_INICIAL: LabState = { status: 'idle' };
const RETRIEVAL_INICIAL: RetrievalState = { status: 'idle' };

const ESTADO_VERSION: Record<string, { etiqueta: string; tono: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  DRAFT: { etiqueta: 'Borrador', tono: 'neutral' },
  TESTING: { etiqueta: 'En prueba', tono: 'accent' },
  PUBLISHED: { etiqueta: 'Publicada', tono: 'success' },
  RETIRED: { etiqueta: 'Retirada', tono: 'warning' },
};

const PROPOSITOS: Option[] = [
  { value: 'INITIAL_GUIDANCE', label: 'Orientación inicial' },
  { value: 'PROCEDURE_EXPLANATION', label: 'Explicación de trámite' },
  { value: 'REQUEST_CLASSIFICATION', label: 'Clasificación de solicitud' },
  { value: 'SUMMARY', label: 'Resumen' },
  { value: 'DRAFTING_ASSISTANCE', label: 'Asistencia de redacción' },
  { value: 'STRUCTURED_EXTRACTION', label: 'Extracción estructurada' },
  { value: 'DELEGATE_REPORT', label: 'Informe de delegación' },
  { value: 'SEMANTIC_SEARCH', label: 'Búsqueda semántica' },
  { value: 'TRANSLATION', label: 'Traducción' },
];

function comoJson(valor: unknown): string {
  try {
    return JSON.stringify(valor ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function Feedback({ estado }: { estado: PromptFormState }) {
  if (estado.status === 'error') return <ErrorNotice title={estado.message ?? 'No se pudo completar la acción'} />;
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Listo'} />;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Editar el borrador (crea una versión nueva)                                */
/* -------------------------------------------------------------------------- */

function EditDraftForm({ prompt, modelos }: { prompt: PromptDetail; modelos: string[] }) {
  const [estado, accion, pendiente] = useActionState(saveDraftAction, INICIAL);
  const base = prompt.versions[0];

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="promptId" value={prompt.id} />
      <Feedback estado={estado} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Guardar crea una <strong>versión nueva</strong> en borrador: una versión publicada no se reescribe, se corrige en otra.
      </p>

      <TextArea name="systemText" label="Texto de sistema" required rows={8} defaultValue={base?.systemText ?? ''} errors={estado.fieldErrors?.['systemText']} />
      {modelos.length > 0 ? (
        <Select name="model" label="Modelo" required options={modelos.map((m) => ({ value: m, label: m }))} defaultValue={base?.model} errors={estado.fieldErrors?.['model']} />
      ) : (
        <Field name="model" label="Modelo" required defaultValue={base?.model ?? ''} errors={estado.fieldErrors?.['model']} />
      )}
      <Field
        name="allowedVariables"
        label="Variables permitidas"
        defaultValue={(base?.allowedVariables ?? []).join(', ')}
        hint="Separadas por comas. Lo que no esté aquí no se interpola."
        errors={estado.fieldErrors?.['allowedVariables']}
      />
      <TextArea name="parameters" label="Parámetros" rows={3} defaultValue={comoJson(base?.parameters)} errors={estado.fieldErrors?.['parameters']} />
      <TextArea name="outputSchema" label="Esquema de salida" rows={5} defaultValue={comoJson(base?.outputSchema)} errors={estado.fieldErrors?.['outputSchema']} />
      <TextArea name="limits" label="Límites de la versión" rows={3} defaultValue={comoJson(base?.limits)} errors={estado.fieldErrors?.['limits']} />

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar versión nueva'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Guardando' : ''}</p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Laboratorio                                                                */
/* -------------------------------------------------------------------------- */

function LabResult({ estado }: { estado: LabState }) {
  if (estado.status === 'error') return <ErrorNotice title={estado.message ?? 'No se pudo probar'} />;
  if (estado.status !== 'ok' || estado.outcome === undefined) return null;
  const r = estado.outcome.result;

  if (r.status === 'SUCCEEDED') {
    return (
      <Notice title="Respuesta del modelo · generada con IA" tone="success">
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-[var(--color-surface-sunken)] p-3 text-sm">{r.output}</pre>
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          {r.promptTokens + r.completionTokens} tokens · costo registrado en la bitácora. La versión queda «en prueba».
        </p>
      </Notice>
    );
  }
  const mensaje: Record<string, string> = {
    SCHEMA_REJECTED: 'La salida no encajó en el esquema declarado, así que no se muestra. Ajusta el esquema o el texto de sistema.',
    DEGRADED: 'La IA no está disponible ahora (apagada o sin clave). En producción, este flujo caería al camino humano.',
    LIMIT_EXCEEDED: 'Se alcanzó un límite del proveedor (tokens, peticiones por día o costo mensual): no se llamó al modelo.',
    PROVIDER_ERROR: 'El proveedor no completó la petición. Vuelve a intentarlo más tarde.',
    TIMEOUT: 'El proveedor no respondió a tiempo.',
  };
  return <Notice title="La prueba no devolvió una respuesta" tone="warning"><p>{mensaje[r.status] ?? r.status}</p></Notice>;
}

function LabForm({ prompt }: { prompt: PromptDetail }) {
  const [estado, accion, pendiente] = useActionState(labRunAction, LAB_INICIAL);
  const probables = prompt.versions.filter((v) => v.status === 'DRAFT' || v.status === 'TESTING');

  if (probables.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">No hay ninguna versión en borrador o en prueba para probar. Crea o edita un borrador primero.</p>;
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="promptId" value={prompt.id} />
      <LabResult estado={estado} />
      <Select
        name="promptVersionId"
        label="Versión a probar"
        required
        options={probables.map((v) => ({ value: v.id, label: `Versión ${v.version} · ${ESTADO_VERSION[v.status]?.etiqueta ?? v.status}` }))}
      />
      <Select name="purpose" label="Propósito" required options={PROPOSITOS} />
      <TextArea
        name="userText"
        label="Texto de entrada"
        required
        rows={4}
        hint="Lo que se le enviaría al modelo. Es una prueba: no escribas datos reales de personas."
        errors={estado.fieldErrors?.['userText']}
      />
      <SubmitButton>{pendiente ? 'Probando…' : 'Probar contra el modelo'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Probando' : ''}</p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Publicar y retirar                                                         */
/* -------------------------------------------------------------------------- */

function PublishForm({ prompt }: { prompt: PromptDetail }) {
  const [estado, accion, pendiente] = useActionState(publishAction, INICIAL);
  const publicables = prompt.versions.filter((v) => v.status === 'DRAFT' || v.status === 'TESTING');

  if (publicables.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">No hay ninguna versión lista para publicar.</p>;
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="promptId" value={prompt.id} />
      <Feedback estado={estado} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Publicar exige que quien publica no sea quien redactó la versión: es lo que hace real la revisión.
      </p>
      <Select
        name="versionId"
        label="Versión a publicar"
        required
        options={publicables.map((v) => ({ value: v.id, label: `Versión ${v.version} · ${ESTADO_VERSION[v.status]?.etiqueta ?? v.status}` }))}
      />
      <TextArea name="reason" label="Motivo" required rows={2} hint="Queda en la auditoría. Al menos diez caracteres." errors={estado.fieldErrors?.['reason']} />
      <SubmitButton>{pendiente ? 'Publicando…' : 'Publicar'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Publicando' : ''}</p>
    </form>
  );
}

function RetireForm({ prompt }: { prompt: PromptDetail }) {
  const [estado, accion, pendiente] = useActionState(retireAction, INICIAL);
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="promptId" value={prompt.id} />
      <Feedback estado={estado} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Retirar deja el prompt sin versión vigente: sus flujos asistidos pasan a operar por el camino humano.
      </p>
      <TextArea name="reason" label="Motivo" required rows={2} hint="Queda en la auditoría. Al menos diez caracteres." errors={estado.fieldErrors?.['reason']} />
      <SubmitButton>{pendiente ? 'Retirando…' : 'Retirar el prompt'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Retirando' : ''}</p>
    </form>
  );
}

function RevertForm({ prompt }: { prompt: PromptDetail }) {
  const [estado, accion, pendiente] = useActionState(revertAction, INICIAL);
  const revertibles = prompt.versions.filter((v) => v.status === 'PUBLISHED' || v.status === 'RETIRED');

  if (revertibles.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">Todavía no hay versiones antiguas a las que revertir.</p>;
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="promptId" value={prompt.id} />
      <Feedback estado={estado} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Revertir crea una versión nueva con el contenido de una antigua, sin borrar nada. No se publica sola.
      </p>
      <Select
        name="versionId"
        label="Versión a recuperar"
        required
        options={revertibles.map((v) => ({ value: v.id, label: `Versión ${v.version} · ${ESTADO_VERSION[v.status]?.etiqueta ?? v.status}` }))}
      />
      <TextArea name="reason" label="Motivo" required rows={2} hint="Queda en la auditoría. Al menos diez caracteres." errors={estado.fieldErrors?.['reason']} />
      <SubmitButton>{pendiente ? 'Revirtiendo…' : 'Revertir a esta versión'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Revirtiendo' : ''}</p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Fuentes autorizadas y prueba de recuperación                               */
/* -------------------------------------------------------------------------- */

function SourcesForm({ prompt, fuentes }: { prompt: PromptDetail; fuentes: Fuente[] }) {
  const [estado, accion, pendiente] = useActionState(setSourcesAction, INICIAL);
  const objetivo = prompt.versions.find((v) => v.status === 'DRAFT' || v.status === 'TESTING');

  if (objetivo === undefined) {
    return <p className="text-sm text-[var(--color-ink-soft)]">Solo se editan las fuentes de una versión en borrador o en prueba. Crea o edita un borrador primero.</p>;
  }
  if (fuentes.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">No hay fuentes registradas todavía. Regístralas en la base documental de IA.</p>;
  }
  const marcadas = new Set(objetivo.authorizedSourceIds);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="promptId" value={prompt.id} />
      <input type="hidden" name="promptVersionId" value={objetivo.id} />
      <Feedback estado={estado} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Marca qué fuentes puede consultar la versión {objetivo.version}. Un prompt lee solo lo que se le autoriza.
      </p>
      <fieldset className="space-y-2">
        <legend className="sr-only">Fuentes autorizadas de la versión</legend>
        {fuentes.map((f) => (
          <label key={f.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="sourceIds" value={f.id} defaultChecked={marcadas.has(f.id)} className="mt-1" />
            <span>
              {f.code} — {f.name}
              {f.requiredPermissionCode !== null && (
                <span className="text-xs text-[var(--color-ink-faint)]"> · exige {f.requiredPermissionCode}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar fuentes de la versión'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Guardando' : ''}</p>
    </form>
  );
}

function RetrievalTest({ prompt }: { prompt: PromptDetail }) {
  const [estado, accion, pendiente] = useActionState(retrievalTestAction, RETRIEVAL_INICIAL);
  const versiones = prompt.versions.filter((v) => v.authorizedSourceIds.length > 0);

  if (versiones.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">Ninguna versión tiene fuentes autorizadas. Autoriza fuentes arriba para poder probar la recuperación.</p>;
  }

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo recuperar'} />}
      <Select name="promptVersionId" label="Versión" required options={versiones.map((v) => ({ value: v.id, label: `Versión ${v.version}` }))} />
      <TextArea name="queryText" label="Consulta" required rows={2} hint="Lo que se buscaría en las fuentes. Verás solo los fragmentos que tú puedes leer." />
      <SubmitButton>{pendiente ? 'Recuperando…' : 'Probar recuperación'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Recuperando' : ''}</p>
      {estado.status === 'ok' && estado.result !== undefined ? (
        estado.result.status === 'DEGRADED' ? (
          <Notice title="La IA no está disponible" tone="warning">
            <p>Sin proveedor no hay vectorización: la búsqueda semántica cae al camino humano.</p>
          </Notice>
        ) : estado.result.chunks.length === 0 ? (
          <Notice title="Sin resultados" tone="neutral">
            <p>Ningún fragmento que tú puedas leer coincide, o la versión no tiene fuentes indexadas.</p>
          </Notice>
        ) : (
          <ul className="space-y-2">
            {estado.result.chunks.map((c) => (
              <li key={c.id} className="rounded border border-[var(--color-line)] p-3 text-sm">
                <span className="block text-xs text-[var(--color-ink-faint)]">{c.sourceCode} · similitud {(c.similarity * 100).toFixed(0)}%</span>
                {c.text}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor completo                                                            */
/* -------------------------------------------------------------------------- */

export function PromptEditor({
  prompt,
  canEdit,
  canPublish,
  modelos,
  fuentes,
  timeZone,
}: {
  prompt: PromptDetail;
  canEdit: boolean;
  canPublish: boolean;
  modelos: string[];
  fuentes: Fuente[];
  timeZone: string;
}) {
  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Badge tone={prompt.currentVersionId !== null ? 'success' : 'neutral'}>
          {prompt.currentVersionId !== null ? 'Con versión publicada' : 'Sin versión publicada'}
        </Badge>
        <Badge tone={prompt.criticality === 'CRITICAL' ? 'warning' : 'neutral'}>
          {prompt.criticality === 'CRITICAL' ? 'Crítico' : 'Estándar'}
        </Badge>
        <Badge tone="neutral">Módulo: {prompt.module}</Badge>
      </div>

      <Section title="Versiones" description="El historial completo. Corregir una versión crea otra; nada se sobrescribe.">
        <ScrollableTable caption="Versiones del prompt, con su estado, autoría y revisión">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left">
              <th scope="col" className="p-3 font-medium">Versión</th>
              <th scope="col" className="p-3 font-medium">Estado</th>
              <th scope="col" className="p-3 font-medium">Autoría</th>
              <th scope="col" className="p-3 font-medium">Revisión</th>
              <th scope="col" className="p-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {prompt.versions.map((v: PromptVersionDetail) => (
              <tr key={v.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                <td className="p-3 tabular-nums">
                  v{v.version}
                  {v.isCurrent && <span className="mt-1 block text-xs font-medium text-[var(--color-success)]">Vigente</span>}
                  {v.revertedFromVersion !== null && (
                    <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">Reversión de la v{v.revertedFromVersion}</span>
                  )}
                </td>
                <td className="p-3"><Badge tone={ESTADO_VERSION[v.status]?.tono ?? 'neutral'}>{ESTADO_VERSION[v.status]?.etiqueta ?? v.status}</Badge></td>
                <td className="p-3 text-sm">{v.authorName}</td>
                <td className="p-3 text-sm">{v.reviewerName ?? '—'}</td>
                <td className="p-3 tabular-nums text-sm">{formatter.format(v.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </ScrollableTable>
      </Section>

      {canEdit && (
        <Section title="Laboratorio" description="Prueba una versión sin publicar contra el modelo. Cuesta, se registra y respeta los límites, igual que en producción.">
          <Card><LabForm prompt={prompt} /></Card>
        </Section>
      )}

      {canEdit && (
        <Section title="Editar" description="Guarda una versión nueva a partir de la última.">
          <Card>
            <Disclosure summary="Editar el contenido y guardar una versión nueva">
              <EditDraftForm prompt={prompt} modelos={modelos} />
            </Disclosure>
          </Card>
        </Section>
      )}

      {canEdit && (
        <Section title="Fuentes autorizadas" description="Qué fuentes de la base documental puede consultar este prompt. Lee solo lo que se le autoriza, y solo lo que quien pregunta puede leer.">
          <Card><SourcesForm prompt={prompt} fuentes={fuentes} /></Card>
        </Section>
      )}

      {canEdit && (
        <Section title="Probar recuperación" description="Busca en las fuentes autorizadas con tus propios permisos: verás solo los fragmentos que tú puedes leer.">
          <Card><RetrievalTest prompt={prompt} /></Card>
        </Section>
      )}

      {canPublish && (
        <Section title="Publicar" description="Revisa y publica una versión. Quien publica no puede ser quien la redactó.">
          <Card><PublishForm prompt={prompt} /></Card>
        </Section>
      )}

      {canEdit && (
        <Section title="Revertir" description="Vuelve a una versión anterior creando una nueva, sin perder el historial.">
          <Card><RevertForm prompt={prompt} /></Card>
        </Section>
      )}

      {canPublish && prompt.currentVersionId !== null && (
        <Section title="Retirar" description="Deja el prompt sin versión vigente.">
          <Card><RetireForm prompt={prompt} /></Card>
        </Section>
      )}

      {!canEdit && !canPublish && (
        <Notice title="Solo lectura" tone="neutral">
          <p>Puedes consultar este prompt y su historial, pero no editarlo ni publicarlo.</p>
        </Notice>
      )}
    </div>
  );
}
