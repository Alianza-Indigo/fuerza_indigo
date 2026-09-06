'use client';

import { useActionState, useState } from 'react';
import { ErrorNotice, Notice, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import type { CaseMessageAudience } from '@prisma-client/enums';
import { NOMBRE_DE_AUDIENCIA, QUE_SIGNIFICA_LA_AUDIENCIA } from '@/modules/cases/domain';
import { editMessageAction, sendMessageAction, type CaseFormState } from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

/**
 * Comunicación dentro del expediente (PRD §10.2).
 *
 * La audiencia se elige **antes** de escribir y cada opción dice quién la va a
 * leer, con esas palabras. Un desplegable con tres siglas al pie del cuadro de
 * texto haría que la elección se tomara al final, cuando ya se escribió
 * pensando en otra persona.
 *
 * La opción reservada solo aparece para quien puede leer lo reservado: ofrecer
 * un destino al que después no se puede volver invita a dejar ahí información
 * que su autor no podrá consultar.
 */
export function SendMessageForm({
  caseId,
  puedeReservar,
}: {
  caseId: string;
  puedeReservar: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(sendMessageAction, INICIAL);
  const [audiencia, setAudiencia] = useState<string>('PERSON_AND_TEAM');
  const errores = estado.fieldErrors ?? {};

  const destinos: CaseMessageAudience[] = puedeReservar
    ? ['PERSON_AND_TEAM', 'TEAM_ONLY', 'SUPERVISION_ONLY']
    : ['PERSON_AND_TEAM', 'TEAM_ONLY'];

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Enviada'} />}

      <input type="hidden" name="caseId" value={caseId} />

      <RadioGroup
        name="audience"
        legend="¿Quién la va a leer?"
        options={destinos.map((valor) => ({
          value: valor,
          label: NOMBRE_DE_AUDIENCIA[valor],
          hint: QUE_SIGNIFICA_LA_AUDIENCIA[valor],
        }))}
        value={audiencia}
        onChange={setAudiencia}
        {...(errores['audience'] === undefined ? {} : { errors: errores['audience'] })}
      />

      {audiencia === 'PERSON_AND_TEAM' && (
        <Notice title="La va a leer la persona" tone="accent" live="status">
          <p>
            Escríbela para quien la va a recibir, no para el expediente. Cuando la abra desde su portal quedará
            constancia de que la leyó, y desde ese momento ya no se puede corregir.
          </p>
        </Notice>
      )}

      <TextArea
        name="body"
        label="¿Qué se comunica?"
        required
        rows={5}
        {...(errores['body'] === undefined ? {} : { errors: errores['body'] })}
      />

      <SubmitButton>{pendiente ? 'Enviando…' : 'Enviar la comunicación'}</SubmitButton>
    </form>
  );
}

/** Corrección de una comunicación propia que todavía nadie ha leído. */
export function EditMessageForm({ messageId, cuerpo }: { messageId: string; cuerpo: string }) {
  const [estado, accion, pendiente] = useActionState(editMessageAction, INICIAL);
  const [abierto, setAbierto] = useState(false);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Corregida'} />;
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm underline underline-offset-4 text-[var(--color-ink-soft)]"
      >
        Corregir esta comunicación
      </button>
    );
  }

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="messageId" value={messageId} />
      <TextArea
        id={`correccion-${messageId}`}
        name="body"
        label="Texto corregido"
        hint="Solo mientras nadie la haya leído. Quedará escrito que se corrigió."
        required
        rows={4}
        defaultValue={cuerpo}
        {...(errores['body'] === undefined ? {} : { errors: errores['body'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Corrigiendo…' : 'Guardar la corrección'}</SubmitButton>
    </form>
  );
}
