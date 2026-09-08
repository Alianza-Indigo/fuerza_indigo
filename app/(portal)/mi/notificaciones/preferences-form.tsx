'use client';

import { useActionState } from 'react';
import { Checkbox, ErrorNotice, Notice, Section, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import type { CategoryPreferenceView } from '@/modules/notifications';
import { CLASE_DE_AVISO } from './etiquetas';
import { savePreferencesAction, type PreferenciasState } from './actions';
import { WebPushSubscribe } from './web-push-subscribe';

const INICIAL: PreferenciasState = { status: 'idle' };

/**
 * Qué clases de aviso quiere ver la persona en su centro (PRD §16.2).
 *
 * Cada casilla dice lo que se recibe, no lo que se apaga: se marca lo que se
 * quiere. La clase obligatoria de gobierno no es una casilla —no se puede
 * apagar— y se muestra aparte, encendida y explicada, para que quede claro que
 * no es un olvido sino una regla.
 */
export function PreferencesForm({
  categories,
  webPushSubscribed,
}: {
  categories: CategoryPreferenceView[];
  webPushSubscribed: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(savePreferencesAction, INICIAL);
  const opcionales = categories.filter((categoria) => !categoria.mandatory);
  const obligatorias = categories.filter((categoria) => categoria.mandatory);

  return (
    <div className="space-y-8">
      <Section title="Avisos web en este dispositivo" level={3}>
        <WebPushSubscribe subscribed={webPushSubscribed} />
      </Section>

      <form action={accion} className="space-y-5">
        {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudieron guardar'} />}
        {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Guardado'} />}

        <fieldset className="space-y-1">
          <legend className="mb-2 font-medium">Clases que puedes silenciar en tu centro</legend>
          {opcionales.map(({ category, inAppSuppressed }) => {
            const meta = CLASE_DE_AVISO[category];
            return (
              <Checkbox
                key={category}
                name={`receive:${category}`}
                label={`${meta.label}: recibir en mi centro`}
                help={meta.description}
                defaultChecked={!inAppSuppressed}
              />
            );
          })}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-2 font-medium">Cuáles quieres también como aviso web</legend>
          <p className="mb-2 text-sm text-[var(--color-ink-soft)]">
            Solo llegan si activaste los avisos web arriba, en el dispositivo donde los activaste.
          </p>
          {opcionales.map(({ category, webPushSuppressed }) => {
            const meta = CLASE_DE_AVISO[category];
            return (
              <Checkbox
                key={category}
                name={`web:${category}`}
                label={`${meta.label}: recibir como aviso web`}
                defaultChecked={!webPushSuppressed}
              />
            );
          })}
        </fieldset>

        {obligatorias.map(({ category }) => (
          <Notice key={category} tone="accent" title={`${CLASE_DE_AVISO[category].label}: siempre activo`}>
            <p>
              {CLASE_DE_AVISO[category].description} No se pueden silenciar: son la vía por la que la organización te
              informa de lo que te obliga.
            </p>
          </Notice>
        ))}

        <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar mis preferencias'}</SubmitButton>
        <p aria-live="polite" className="sr-only">{pendiente ? 'Guardando' : ''}</p>
      </form>
    </div>
  );
}
