'use client';

import { useActionState } from 'react';
import { ErrorNotice, Notice, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import {
  endMembershipAction,
  reinstateMembershipAction,
  suspendMembershipAction,
  type MembresiaState,
} from '../actions';
import { MOTIVOS_DE_BAJA } from '../etiquetas';

const INICIAL: MembresiaState = { status: 'idle' };

/** Suspender: una pausa, no una salida. */
export function SuspendForm({ membershipId }: { membershipId: string }) {
  const [estado, accion, pendiente] = useActionState(suspendMembershipAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Membresía suspendida'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="membershipId" value={membershipId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo suspender'} />}
      <TextArea
        name="reason"
        label="Motivo de la suspensión"
        required
        rows={3}
        hint="Queda en el expediente y la persona puede pedirlo."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />
      <Notice tone="neutral" title="Suspender no es dar de baja">
        <p>La membresía sigue existiendo y se puede levantar. No se le pone fecha de fin.</p>
      </Notice>
      <SubmitButton variant="danger">{pendiente ? 'Suspendiendo…' : 'Suspender'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Suspendiendo' : ''}</p>
    </form>
  );
}

/** Levantar la suspensión, con el mismo requisito de motivo que ponerla. */
export function ReinstateForm({ membershipId }: { membershipId: string }) {
  const [estado, accion, pendiente] = useActionState(reinstateMembershipAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Suspensión levantada'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="membershipId" value={membershipId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo levantar'} />}
      <TextArea
        name="reason"
        label="Motivo para levantarla"
        required
        rows={3}
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton>{pendiente ? 'Levantando…' : 'Levantar la suspensión'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Levantando' : ''}</p>
    </form>
  );
}

/**
 * Terminar la membresía.
 *
 * Los siete motivos se eligen de una lista, y cada uno dice qué significa. Un
 * campo de texto libre acabaría con «baja» anotado igual para quien se fue y
 * para quien fue expulsado, y el padrón que alguien consulte años después no
 * podría distinguirlos.
 */
export function EndForm({ membershipId }: { membershipId: string }) {
  const [estado, accion, pendiente] = useActionState(endMembershipAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Membresía terminada'} />;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="membershipId" value={membershipId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo terminar'} />}

      <RadioGroup
        name="endReason"
        legend="Por qué termina"
        options={MOTIVOS_DE_BAJA.map((motivo) => ({
          value: motivo.value,
          label: motivo.label,
          hint: motivo.help,
        }))}
        value={estado.values?.['endReason']}
        errors={estado.fieldErrors?.['endReason']}
      />
      <TextArea
        name="reason"
        label="Motivo, con tus palabras"
        required
        rows={3}
        hint="La categoría de arriba clasifica; esto explica."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />

      <Notice tone="warning" title="Lo terminado no revive">
        <p>Volver a ser miembro es una solicitud nueva. Así el historial conserva las dos etapas.</p>
      </Notice>

      <SubmitButton variant="danger">{pendiente ? 'Terminando…' : 'Terminar la membresía'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Terminando' : ''}</p>
    </form>
  );
}
