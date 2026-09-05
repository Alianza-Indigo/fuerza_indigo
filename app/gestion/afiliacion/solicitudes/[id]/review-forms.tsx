'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Field,
  Notice,
  RadioGroup,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import {
  closeClarificationAction,
  recordRecommendationAction,
  requestClarificationAction,
  resolveApplicationAction,
  startReviewAction,
  type RevisionState,
} from '../review-actions';

const INICIAL: RevisionState = { status: 'idle' };

/** Toma de la solicitud (PRD §8.1, paso 9). */
export function StartReviewForm({ applicationId }: { applicationId: string }) {
  const [estado, accion, pendiente] = useActionState(startReviewAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Solicitud tomada'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo tomar'} />}
      <TextArea
        name="note"
        label="Nota de la toma"
        rows={2}
        hint="Opcional. Si hay algo que quieras dejar dicho al empezar, este es el sitio."
        defaultValue={estado.values?.['note']}
        errors={estado.fieldErrors?.['note']}
      />
      <SubmitButton>{pendiente ? 'Tomando…' : 'Tomar esta solicitud'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Tomando la solicitud' : ''}</p>
    </form>
  );
}

/**
 * Requerimiento de aclaración con plazo (PRD §8.1, paso 10).
 *
 * El aviso a la persona sale de aquí con lo que se escriba, palabra por palabra:
 * lo que se teclee en este campo es literalmente lo que ella va a leer en su
 * correo. Por eso el formulario lo dice, en vez de dejar que quien escribe se
 * entere después de haberlo mandado.
 */
export function RequestClarificationForm({ applicationId }: { applicationId: string }) {
  const [estado, accion, pendiente] = useActionState(requestClarificationAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Aclaración pedida'} />;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo pedir'} />}

      <TextArea
        name="request"
        label="Qué falta"
        required
        rows={5}
        hint="Esto se le manda tal cual. Escríbelo como se lo dirías a la persona, no como una nota interna."
        defaultValue={estado.values?.['request']}
        errors={estado.fieldErrors?.['request']}
      />
      <Field
        name="dueOn"
        label="Hasta cuándo"
        type="date"
        required
        hint="El plazo termina al acabar ese día."
        defaultValue={estado.values?.['dueOn']}
        errors={estado.fieldErrors?.['dueOn']}
      />

      <Notice tone="neutral" title="El plazo no rechaza a nadie">
        <p>
          Si vence sin respuesta, la persona recibe un recordatorio y su solicitud sigue en pie. Para
          continuar sin la aclaración hay que cerrarla a mano, explicando por qué.
        </p>
      </Notice>

      <SubmitButton>{pendiente ? 'Pidiendo…' : 'Pedir la aclaración'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Pidiendo la aclaración' : ''}</p>
    </form>
  );
}

/** Cierre de una aclaración sin respuesta. */
export function CloseClarificationForm({
  clarificationId,
  applicationId,
}: {
  clarificationId: string;
  applicationId: string;
}) {
  const [estado, accion, pendiente] = useActionState(closeClarificationAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Aclaración cerrada'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="clarificationId" value={clarificationId} />
      <input type="hidden" name="applicationId" value={applicationId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo cerrar'} />}
      <TextArea
        name="closeReason"
        label="Por qué se sigue sin la aclaración"
        required
        rows={3}
        hint="Queda en el expediente. Quien resuelva después va a leerlo."
        defaultValue={estado.values?.['closeReason']}
        errors={estado.fieldErrors?.['closeReason']}
      />
      <SubmitButton variant="danger">{pendiente ? 'Cerrando…' : 'Cerrar sin respuesta'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Cerrando la aclaración' : ''}</p>
    </form>
  );
}

/** Recomendación de quien revisa (PRD §8.1, paso 9). */
export function RecommendationForm({ applicationId }: { applicationId: string }) {
  const [estado, accion, pendiente] = useActionState(recordRecommendationAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Recomendación registrada'} />;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}

      <RadioGroup
        name="recommendation"
        legend="Qué recomiendas"
        options={[
          { value: 'RECOMMENDED_APPROVAL', label: 'Recomiendo aprobar' },
          { value: 'RECOMMENDED_REJECTION', label: 'Recomiendo rechazar' },
        ]}
        value={estado.values?.['recommendation']}
        errors={estado.fieldErrors?.['recommendation']}
      />
      <TextArea
        name="rationale"
        label="En qué te apoyas"
        required
        rows={4}
        hint="Lo va a leer quien resuelve. Cita lo que revisaste."
        defaultValue={estado.values?.['rationale']}
        errors={estado.fieldErrors?.['rationale']}
      />
      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar la recomendación'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Registrando' : ''}</p>
    </form>
  );
}

/**
 * Resolución fundada (PRD §8.1, paso 11).
 *
 * El fundamento se le manda entero a la persona, apruebe o rechace. Un rechazo
 * cuyo motivo la persona no puede leer es un rechazo que no puede discutir.
 */
export function ResolutionForm({ applicationId }: { applicationId: string }) {
  const [estado, accion, pendiente] = useActionState(resolveApplicationAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Solicitud resuelta'} />;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo resolver'} />}

      <TextArea
        name="rationale"
        label="Fundamento y motivo"
        required
        rows={5}
        hint="Se le manda completo a la persona, se apruebe o se rechace."
        defaultValue={estado.values?.['rationale']}
        errors={estado.fieldErrors?.['rationale']}
      />

      <Notice tone="warning" title="Esto resuelve el expediente">
        <p>
          Una solicitud resuelta no vuelve a revisión. Si aún falta algo por comprobar, pide una aclaración
          en vez de resolver.
        </p>
      </Notice>

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="APPROVED">
          {pendiente ? 'Resolviendo…' : 'Aprobar'}
        </SubmitButton>
        <SubmitButton variant="danger" name="decision" value="REJECTED">
          Rechazar
        </SubmitButton>
      </div>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Resolviendo' : ''}</p>
    </form>
  );
}
