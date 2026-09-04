'use client';

import { useActionState } from 'react';
import { RadioGroup, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { PREFERENCE_LABELS, type Preferences } from '@/platform/preferences/preferences';
import { savePreferencesAction, type PreferencesState } from './actions';

const INICIAL: PreferencesState = { status: 'idle' };

const EJES = ['text', 'density', 'motion', 'focus', 'theme'] as const;

/**
 * Formulario de preferencias.
 *
 * Un `<form>` con `action`: funciona sin JavaScript. Guardar recarga y el efecto
 * se ve de inmediato, porque las preferencias se aplican en el servidor.
 *
 * Los cinco ejes son independientes y así se presentan. No hay un «modo
 * accesible» que los active en bloque: quien necesita el texto más grande no
 * necesariamente quiere perder el movimiento, y agruparlos obligaría a aceptar
 * cambios que nadie pidió.
 */
export function PreferencesForm({ valores }: { valores: Preferences }) {
  const [estado, accion, pendiente] = useActionState(savePreferencesAction, INICIAL);

  return (
    <form action={accion} className="space-y-8">
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Guardado'} />}

      {EJES.map((eje) => (
        <RadioGroup
          key={eje}
          name={eje}
          legend={PREFERENCE_LABELS[eje].legend}
          help={PREFERENCE_LABELS[eje].help}
          options={[...PREFERENCE_LABELS[eje].options]}
          value={valores[eje]}
        />
      ))}

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar mis preferencias'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Guardando las preferencias' : ''}
      </p>
    </form>
  );
}
