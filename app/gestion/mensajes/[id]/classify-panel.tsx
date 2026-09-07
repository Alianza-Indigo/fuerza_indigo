'use client';

import { useActionState, useState } from 'react';
import { Badge, ErrorNotice, Notice, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import type { AiReviewDecision } from '@prisma-client/enums';
import { reviewGenerationAction, suggestClassificationAction, type RequestState } from '../actions';

const INICIAL: RequestState = { status: 'idle' };

const DECISION_ROTULO: Record<AiReviewDecision, string> = {
  ACCEPTED: 'Aceptada',
  EDITED: 'Corregida',
  REJECTED: 'Rechazada',
};

/**
 * Revisión de una clasificación sugerida por IA (criterio 4).
 *
 * A diferencia de un texto, una clasificación no se «corrige» aquí: se acepta o
 * se rechaza. Corregirla es confirmar otra entidad abajo, y por eso esta revisión
 * ofrece solo las dos decisiones que tienen sentido sobre una propuesta.
 */
function ClassificationReview({ requestId, generationId }: { requestId: string; generationId: string }) {
  const [estado, accion, pendiente] = useActionState(reviewGenerationAction, INICIAL);
  const [decision, setDecision] = useState('ACCEPTED');
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Revisada'} />;
  }

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="generationId" value={generationId} />

      <RadioGroup
        name="decision"
        id="clasificacion-decision"
        legend="¿Aceptas la canalización que sugirió la IA?"
        value={decision}
        onChange={setDecision}
        options={[
          { value: 'ACCEPTED', label: 'Aceptarla', hint: 'Podrás confirmarla abajo.' },
          { value: 'REJECTED', label: 'Rechazarla', hint: 'No te convence; dices por qué y canalizas tú.' },
        ]}
        {...(errores['decision'] === undefined ? {} : { errors: errores['decision'] })}
      />

      {decision === 'REJECTED' && (
        <TextArea
          name="comment"
          id="clasificacion-comentario"
          label="¿Por qué la rechazas?"
          hint="Con una frase basta. Ayuda a mejorar el prompt de clasificación."
          required
          rows={2}
          {...(errores['comment'] === undefined ? {} : { errors: errores['comment'] })}
        />
      )}

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar la revisión'}</SubmitButton>
    </form>
  );
}

/**
 * Clasificación asistida de un mensaje sin canalizar.
 *
 * La IA entra donde ya hay alguien que puede leer el mensaje, no antes: la
 * canalización automática que decide quién lo lee primero la sigue calculando una
 * tabla escrita (Fase 6). Aquí, quien atiende puede pedir una sugerencia, que
 * queda como propuesta sin ejecutar nada y **no se confirma sin revisarse**.
 */
export function ClassifyPanel({
  requestId,
  sugeridaPorIa,
}: {
  requestId: string;
  sugeridaPorIa: { generationId: string; decision: AiReviewDecision | null } | null;
}) {
  const [estado, accion, pendiente] = useActionState(suggestClassificationAction, INICIAL);

  if (sugeridaPorIa !== null) {
    return (
      <div className="space-y-4">
        <Notice title="La canalización de arriba la sugirió la IA" tone="accent" live="none">
          <p>
            <Badge tone="accent">Generado con IA</Badge> Es una propuesta y no ejecuta nada. Antes de confirmarla, una
            persona tiene que aceptarla o rechazarla.
          </p>
          {sugeridaPorIa.decision !== null && (
            <p className="mt-2 font-medium">Revisión: {DECISION_ROTULO[sugeridaPorIa.decision]}.</p>
          )}
        </Notice>
        {sugeridaPorIa.decision === null && (
          <ClassificationReview requestId={requestId} generationId={sugeridaPorIa.generationId} />
        )}
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && estado.message !== undefined && <SuccessNotice title={estado.message} />}
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Puedes pedirle a la IA una sugerencia de canalización a partir de lo que la persona contó. La revisarás antes de
        confirmar nada.
      </p>
      <SubmitButton variant="secondary">{pendiente ? 'Consultando a la IA…' : 'Sugerir canalización con IA'}</SubmitButton>
    </form>
  );
}
