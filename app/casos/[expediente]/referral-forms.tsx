'use client';

import { useActionState, useState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Field,
  Notice,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import { CAMPOS_TRANSFERIBLES } from '@/modules/cases/domain';
import {
  acceptReferralAction,
  closeReferralAction,
  proposeReferralAction,
  requestReferralConsentAction,
  returnReferralAction,
  sendReferralAction,
  type CaseFormState,
} from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

export interface OpcionDeEntidad {
  readonly value: string;
  readonly label: string;
}

export interface DocumentoCanalizable {
  readonly value: string;
  readonly label: string;
}

/**
 * Propuesta de canalización (PRD §10.4, requisitos 1 y 3).
 *
 * Se piden dos textos distintos y no uno: **por qué se canaliza** —que lo lee
 * el área receptora— y **qué se le explica a la persona** —que lo lee ella—. Un
 * solo campo acabaría escrito para el área, y la persona recibiría una
 * justificación técnica en lugar de una explicación.
 *
 * Lo que se transfiere se marca casilla por casilla, de una lista cerrada. Las
 * notas reservadas y las comunicaciones internas no están en ella: no se
 * esconden al enviar, es que no se pueden elegir.
 */
export function ProposeReferralForm({
  caseId,
  entidades,
  documentos,
}: {
  caseId: string;
  entidades: readonly OpcionDeEntidad[];
  documentos: readonly DocumentoCanalizable[];
}) {
  const [estado, accion, pendiente] = useActionState(proposeReferralAction, INICIAL);
  const [destino, setDestino] = useState<string>('SOCIAL_ATTENTION');
  const errores = estado.fieldErrors ?? {};

  const externa = destino === 'EXTERNAL';

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Propuesta registrada'} />}

      <input type="hidden" name="caseId" value={caseId} />

      <RadioGroup
        name="toModule"
        legend="¿A dónde se canaliza?"
        options={[
          { value: 'SOCIAL_ATTENTION', label: 'Atención social', hint: 'El asunto es de acompañamiento, no sindical.' },
          { value: 'UNION_DEFENSE', label: 'Defensa sindical', hint: 'El asunto es laboral y le toca al sindicato.' },
          {
            value: 'EXTERNAL',
            label: 'Una institución de fuera',
            hint: 'Una autoridad, una clínica, otra organización.',
          },
        ]}
        value={destino}
        onChange={setDestino}
        {...(errores['toModule'] === undefined ? {} : { errors: errores['toModule'] })}
      />

      <Select
        name="toLegalEntityId"
        label="¿Qué entidad responde de ella?"
        hint={
          externa
            ? 'La entidad del ecosistema que coordina el envío a la institución de fuera.'
            : 'Fuerza Índigo y Alianza Índigo son personas morales distintas.'
        }
        required
        options={[...entidades]}
        {...(errores['toLegalEntityId'] === undefined ? {} : { errors: errores['toLegalEntityId'] })}
      />

      {externa && (
        <Field
          name="externalRecipient"
          label="¿Quién la recibe?"
          hint="El nombre de la institución. Sin él quedaría enviada a nadie."
          required
          {...(errores['externalRecipient'] === undefined ? {} : { errors: errores['externalRecipient'] })}
        />
      )}

      <TextArea
        name="reason"
        label="¿Por qué se canaliza?"
        hint="Lo lee quien recibe el asunto."
        required
        rows={3}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <TextArea
        name="explanationShownToPerson"
        label="¿Qué se le explica a la persona?"
        hint="Esto es lo que ella va a leer antes de decidir. En sus términos, no en los del expediente."
        required
        rows={4}
        {...(errores['explanationShownToPerson'] === undefined
          ? {}
          : { errors: errores['explanationShownToPerson'] })}
      />

      <fieldset className="space-y-3">
        <legend className="font-medium">¿Qué se transfiere?</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Solo esto puede viajar. Las notas reservadas y las comunicaciones internas del equipo no están en la lista,
          y por eso no se transfieren ni por descuido.
        </p>
        {Object.entries(CAMPOS_TRANSFERIBLES).map(([campo, explicacion]) => (
          <Checkbox key={campo} name="sharedFields" id={`campo-${campo}`} label={explicacion} value={campo} />
        ))}
        {errores['sharedFields'] !== undefined && (
          <p className="text-sm text-[var(--color-danger)]">{errores['sharedFields'].join(' ')}</p>
        )}
      </fieldset>

      {documentos.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-medium">¿Qué documentos van con ella?</legend>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Cada archivo que viaja lleva su propio consentimiento, y solo viajan los que están en este expediente.
          </p>
          {documentos.map((documento) => (
            <Checkbox
              key={documento.value}
              name="sharedFileIds"
              id={`archivo-${documento.value}`}
              label={documento.label}
              value={documento.value}
            />
          ))}
        </fieldset>
      )}

      <SubmitButton>{pendiente ? 'Registrando…' : 'Proponer la canalización'}</SubmitButton>
    </form>
  );
}

/** Constancia de que se le explicó a la persona y se le pidió el consentimiento. */
export function RequestConsentForm({ referralId, explicacion }: { referralId: string; explicacion: string }) {
  const [estado, accion, pendiente] = useActionState(requestReferralConsentAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Constancia registrada'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="referralId" value={referralId} />
      <Notice title="Esto es lo que se le va a explicar" tone="accent" live="none">
        <p className="whitespace-pre-wrap">{explicacion}</p>
      </Notice>
      <SubmitButton variant="secondary">
        {pendiente ? 'Registrando…' : 'Se lo expliqué y le pedí el consentimiento'}
      </SubmitButton>
    </form>
  );
}

/** Envío, con el consentimiento específico que lo ampara. */
export function SendReferralForm({ referralId }: { referralId: string }) {
  const [estado, accion, pendiente] = useActionState(sendReferralAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Enviada'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="referralId" value={referralId} />
      <Field
        id={`consentimiento-${referralId}`}
        name="consentId"
        label="Consentimiento que la ampara"
        hint="El que la persona otorgó sobre esta canalización y esta selección. Uno general no sirve."
        required
        {...(errores['consentId'] === undefined ? {} : { errors: errores['consentId'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Enviando…' : 'Enviar al área receptora'}</SubmitButton>
    </form>
  );
}

/** Aceptación por el área receptora (requisito 4). */
export function AcceptReferralForm({ referralId }: { referralId: string }) {
  const [estado, accion, pendiente] = useActionState(acceptReferralAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Aceptada'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="referralId" value={referralId} />
      <TextArea
        id={`aceptacion-${referralId}`}
        name="note"
        label="¿Por qué se hace cargo esta área?"
        hint="Aceptar es asumir un asunto ajeno. Queda en la bitácora con tu nombre."
        required
        rows={2}
        {...(errores['note'] === undefined ? {} : { errors: errores['note'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Aceptando…' : 'Aceptar la canalización'}</SubmitButton>
    </form>
  );
}

/** Devolución o rechazo, siempre con motivo (requisito 6). */
export function ReturnReferralForm({ referralId }: { referralId: string }) {
  const [estado, accion, pendiente] = useActionState(returnReferralAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Devuelta'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="referralId" value={referralId} />
      <TextArea
        id={`devolucion-${referralId}`}
        name="reason"
        label="¿Por qué se devuelve?"
        hint="Lo lee quien la envió. Nada se descarta en silencio."
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Devolviendo…' : 'Devolver con motivo'}</SubmitButton>
    </form>
  );
}

/** Cierre de una canalización aceptada y terminada. */
export function CloseReferralForm({ referralId }: { referralId: string }) {
  const [estado, accion, pendiente] = useActionState(closeReferralAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Cerrada'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="referralId" value={referralId} />
      <SubmitButton variant="secondary">{pendiente ? 'Cerrando…' : 'Cerrar la canalización'}</SubmitButton>
    </form>
  );
}
