'use client';

import { useActionState, useState } from 'react';
import {
  Badge,
  ErrorNotice,
  Notice,
  RadioGroup,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import { assistOnRequestAction, reviewGenerationAction, type AssistState, type RequestState } from '../actions';

const ASSIST_INICIAL: AssistState = { status: 'idle' };
const REVIEW_INICIAL: RequestState = { status: 'idle' };

const USOS = [
  { value: 'SUMMARY', label: 'Resumir el mensaje', hint: 'Un resumen breve de lo que la persona contó.' },
  { value: 'DRAFTING_ASSISTANCE', label: 'Redactar una respuesta', hint: 'Un borrador de respuesta que puedes corregir.' },
  { value: 'PROCEDURE_EXPLANATION', label: 'Explicar un trámite', hint: 'Una explicación en lenguaje claro, con lo que digan las fuentes autorizadas.' },
  { value: 'INITIAL_GUIDANCE', label: 'Orientación inicial', hint: 'Una primera orientación para la persona.' },
];

/**
 * Revisión de un borrador informativo (criterios 3 y 4).
 *
 * La salida se enseña marcada como generada por IA, y no vale por sí sola: una
 * persona la acepta, la corrige o la rechaza. Corregir es sustituir el texto —lo
 * que «permite corregirla» significa de verdad—; rechazar se explica.
 */
function ReviewPanel({ requestId, generationId, output }: { requestId: string; generationId: string; output: string }) {
  const [estado, accion, pendiente] = useActionState(reviewGenerationAction, REVIEW_INICIAL);
  const [decision, setDecision] = useState('ACCEPTED');
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Revisada'} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="accent">Generado con IA</Badge>
          <span className="text-sm text-[var(--color-accent-ink)]">Borrador sin revisar</span>
        </div>
        <p className="whitespace-pre-wrap leading-relaxed text-[var(--color-ink)]">{output}</p>
      </div>

      <form action={accion} className="space-y-4">
        {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="generationId" value={generationId} />

        <RadioGroup
          name="decision"
          id="asistente-decision"
          legend="¿Qué haces con este borrador?"
          value={decision}
          onChange={setDecision}
          options={[
            { value: 'ACCEPTED', label: 'Aceptarlo', hint: 'Lo usas tal cual.' },
            { value: 'EDITED', label: 'Corregirlo', hint: 'Lo sustituyes por tu versión.' },
            { value: 'REJECTED', label: 'Rechazarlo', hint: 'No sirve; dices por qué.' },
          ]}
          {...(errores['decision'] === undefined ? {} : { errors: errores['decision'] })}
        />

        {decision === 'EDITED' && (
          <TextArea
            name="editedOutput"
            id="asistente-edicion"
            label="Tu versión corregida"
            hint="Es lo que queda como salida revisada."
            required
            rows={6}
            defaultValue={output}
            {...(errores['editedOutput'] === undefined ? {} : { errors: errores['editedOutput'] })}
          />
        )}

        <TextArea
          name="comment"
          id="asistente-comentario"
          label={decision === 'REJECTED' ? '¿Por qué lo rechazas?' : 'Comentario (opcional)'}
          hint={
            decision === 'REJECTED'
              ? 'Con una frase basta. Es lo que permite mejorar el prompt en vez de repetir el mismo resultado.'
              : undefined
          }
          required={decision === 'REJECTED'}
          rows={2}
          {...(errores['comment'] === undefined ? {} : { errors: errores['comment'] })}
        />

        <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar la revisión'}</SubmitButton>
      </form>
    </div>
  );
}

/**
 * El asistente sobre un mensaje: resumir, redactar, explicar u orientar.
 *
 * Cada borrador pasa por el mismo camino gobernado —prompt vigente, recuperación
 * con permisos, minimización— y ninguno surte efecto sin que una persona lo
 * revise. Sin prompt publicado o con la IA apagada, el asistente lo dice y el
 * mensaje se atiende como siempre.
 */
export function AssistantTools({ requestId }: { requestId: string }) {
  const [estado, accion, pendiente] = useActionState(assistOnRequestAction, ASSIST_INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <div className="space-y-6">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="requestId" value={requestId} />
        <RadioGroup
          name="useCase"
          legend="¿En qué te ayuda la IA?"
          value="SUMMARY"
          options={USOS}
          {...(errores['useCase'] === undefined ? {} : { errors: errores['useCase'] })}
        />
        <TextArea
          name="userText"
          label="Instrucción o pregunta"
          hint="Para resumir puedes dejarlo vacío: se resume el relato. Para redactar o explicar, escribe qué necesitas."
          rows={3}
          {...(errores['userText'] === undefined ? {} : { errors: errores['userText'] })}
        />
        <SubmitButton>{pendiente ? 'Generando…' : 'Generar borrador con IA'}</SubmitButton>
      </form>

      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'unavailable' && estado.message !== undefined && (
        <Notice title="La IA no generó un borrador" tone="warning" live="status">
          <p>{estado.message}</p>
        </Notice>
      )}
      {estado.status === 'ok' && estado.output !== undefined && estado.generationId !== undefined && (
        <ReviewPanel requestId={requestId} generationId={estado.generationId} output={estado.output} />
      )}
    </div>
  );
}
