'use client';

import { useActionState, useState } from 'react';
import {
  ErrorNotice,
  Notice,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import type { OpcionDeTerritorio } from '@/modules/support';
import type { LegalEntityCode, SupportUrgency } from '@prisma-client/enums';
import { confirmRoutingAction, type RequestState } from '../actions';

const INICIAL: RequestState = { status: 'idle' };

const NOMBRE: Record<LegalEntityCode, string> = {
  FUERZA_INDIGO: 'Fuerza Índigo — el sindicato',
  ALIANZA_INDIGO: 'Alianza Índigo — la asociación civil',
};

/**
 * Confirmación humana de la canalización (PRD §10.1).
 *
 * La propuesta se enseña **con su motivo** y con la entidad ya marcada, para
 * que confirmar lo habitual cueste un clic. Lo que no se hace es esconder la
 * alternativa: quien confirma tiene que poder estar en desacuerdo, y una
 * pantalla que solo permitiera decir «sí» convertiría la confirmación en un
 * trámite y la propuesta en una decisión.
 *
 * La prioridad no viene marcada por la propuesta. La sugiere, y quien valora la
 * fija: es la valoración de la organización y tiene que ser suya.
 */
export function RoutingForm({
  requestId,
  propuesta,
  territoryHint,
  territorios,
}: {
  requestId: string;
  propuesta: {
    entidad: LegalEntityCode;
    urgencia: SupportUrgency;
    motivo: string;
    alternativa: LegalEntityCode | null;
  } | null;
  /** Lo que la persona escribió sobre dónde vive. Se enseña al lado del desplegable. */
  territoryHint: string | null;
  territorios: readonly OpcionDeTerritorio[];
}) {
  const [estado, accion, pendiente] = useActionState(confirmRoutingAction, INICIAL);
  const [elegida, setElegida] = useState<string>(propuesta?.entidad ?? 'FUERZA_INDIGO');
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Canalizado'} />;
  }

  const seAparta = propuesta !== null && elegida !== propuesta.entidad;

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}

      <input type="hidden" name="requestId" value={requestId} />

      {propuesta === null ? (
        <Notice title="Este mensaje no trae propuesta" tone="warning" live="none">
          <p>
            Llegó antes de que el sistema propusiera canalización, o la propuesta no se pudo leer. Decide tú a qué
            entidad va.
          </p>
        </Notice>
      ) : (
        <Notice title="Lo que el sistema propone" tone="accent" live="none">
          <p>{propuesta.motivo}</p>
          <p className="mt-2">
            Es una propuesta, no una decisión: la tomó una tabla escrita, no una inteligencia artificial, y puedes
            apartarte de ella.
          </p>
        </Notice>
      )}

      <RadioGroup
        name="legalEntity"
        legend="¿A qué entidad se canaliza?"
        options={[
          { value: 'FUERZA_INDIGO', label: NOMBRE.FUERZA_INDIGO },
          { value: 'ALIANZA_INDIGO', label: NOMBRE.ALIANZA_INDIGO },
        ]}
        value={elegida}
        onChange={setElegida}
        {...(errores['legalEntity'] === undefined ? {} : { errors: errores['legalEntity'] })}
      />

      {seAparta && (
        <Notice title="Te apartas de la propuesta" tone="warning" live="status">
          <p>
            Está bien y no hace falta justificarlo más allá de la nota. Queda registrado que la propuesta decía otra
            cosa, para poder corregir la tabla si pasa a menudo.
          </p>
        </Notice>
      )}

      <RadioGroup
        name="urgency"
        legend="¿Con qué prioridad entra?"
        help="La propuesta sugiere una, pero la valoración es tuya."
        options={[
          { value: 'ROUTINE', label: 'Ordinaria', hint: 'Se atiende en el orden habitual.' },
          { value: 'PRIORITY', label: 'Prioritaria', hint: 'Hay un plazo que se pierde o un daño que crece.' },
          { value: 'URGENT', label: 'Urgente', hint: 'Hay riesgo para una persona ahora mismo.' },
        ]}
        value={propuesta?.urgencia ?? 'ROUTINE'}
        {...(errores['urgency'] === undefined ? {} : { errors: errores['urgency'] })}
      />

      <Select
        name="territorialUnitId"
        label="¿De qué territorio es el asunto?"
        hint={
          territoryHint === null
            ? 'Determina qué delegación puede llevarlo. Si no lo sabes todavía, déjalo en blanco.'
            : `Quien escribió dijo: «${territoryHint}». Elige la unidad que le corresponde.`
        }
        options={[
          { value: '', label: 'Todavía no se sabe' },
          ...territorios.map((territorio) => ({
            value: territorio.value,
            label: `${'\u00a0\u00a0'.repeat(territorio.nivel)}${territorio.label}`,
          })),
        ]}
        {...(errores['territorialUnitId'] === undefined ? {} : { errors: errores['territorialUnitId'] })}
      />

      <TextArea
        name="note"
        label="¿Por qué se canaliza así?"
        hint="Lo lee quien reciba el asunto. Con dos líneas basta."
        required
        rows={3}
        {...(errores['note'] === undefined ? {} : { errors: errores['note'] })}
      />

      <SubmitButton>{pendiente ? 'Canalizando…' : 'Confirmar la canalización'}</SubmitButton>
    </form>
  );
}
