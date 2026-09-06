'use client';

import { useActionState, useState } from 'react';
import { ErrorNotice, Notice, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import type { CaseRiskKind } from '@prisma-client/enums';
import { NOMBRE_DE_RIESGO, QUE_SIGNIFICA_EL_RIESGO } from '@/modules/cases/domain';
import {
  acknowledgeEmergencyAction,
  closeEmergencyAction,
  raiseEmergencyAction,
  type CaseFormState,
} from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

const RIESGOS: readonly CaseRiskKind[] = [
  'VIOLENCE',
  'SELF_HARM',
  'CHILD_PROTECTION',
  'HEALTH_EMERGENCY',
  'OTHER',
];

/**
 * Marca de riesgo inmediato (PRD §10.3).
 *
 * La pantalla dice, con esas palabras, **qué hace y qué no hace**: señala el
 * asunto para que una persona lo vea antes, y no avisa a nadie. Un botón que
 * pareciera un botón de emergencia dejaría a alguien esperando una ayuda que
 * este sistema no presta.
 */
export function RaiseEmergencyForm({ caseId }: { caseId: string }) {
  const [estado, accion, pendiente] = useActionState(raiseEmergencyAction, INICIAL);
  const [riesgo, setRiesgo] = useState<string>('VIOLENCE');
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Marcado'} />;

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}

      <input type="hidden" name="caseId" value={caseId} />

      <Notice title="Esto no llama a nadie" tone="warning" live="none">
        <p>
          Marcarlo pone el expediente el primero en la bandeja de quien lo lleva y registra el protocolo que se
          enseñó. No avisa a ninguna autoridad ni a ningún servicio. Si hay peligro ahora mismo, usa las rutas del
          protocolo.
        </p>
      </Notice>

      <RadioGroup
        name="riskKind"
        legend="¿Qué clase de riesgo hay?"
        options={RIESGOS.map((valor) => ({
          value: valor,
          label: NOMBRE_DE_RIESGO[valor],
          hint: QUE_SIGNIFICA_EL_RIESGO[valor],
        }))}
        value={riesgo}
        onChange={setRiesgo}
        {...(errores['riskKind'] === undefined ? {} : { errors: errores['riskKind'] })}
      />

      <TextArea
        name="note"
        label="¿Qué está pasando?"
        hint="Lo lee quien se haga cargo. Lo que haga falta para actuar, sin rodeos."
        required
        rows={3}
        {...(errores['note'] === undefined ? {} : { errors: errores['note'] })}
      />

      <SubmitButton>{pendiente ? 'Marcando…' : 'Marcar riesgo inmediato'}</SubmitButton>
    </form>
  );
}

/** Constancia de que alguien recoge la marca. */
export function AcknowledgeEmergencyForm({ flagId }: { flagId: string }) {
  const [estado, accion, pendiente] = useActionState(acknowledgeEmergencyAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Te haces cargo'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="flagId" value={flagId} />
      <TextArea
        id={`recogida-${flagId}`}
        name="note"
        label="¿Qué vas a hacer ahora?"
        hint="Lo lee el resto del equipo mientras todavía sirve. Al cerrar se escribe qué pasó."
        required
        rows={2}
        {...(errores['note'] === undefined ? {} : { errors: errores['note'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Registrando…' : 'Me hago cargo'}</SubmitButton>
    </form>
  );
}

/** Cierre de la marca, con lo que se hizo. */
export function CloseEmergencyForm({ flagId }: { flagId: string }) {
  const [estado, accion, pendiente] = useActionState(closeEmergencyAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Cerrada'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="flagId" value={flagId} />
      <TextArea
        id={`resolucion-${flagId}`}
        name="resolution"
        label="¿Qué se hizo?"
        hint="Cerrar una marca de riesgo sin decir qué pasó no cierra nada."
        required
        rows={3}
        {...(errores['resolution'] === undefined ? {} : { errors: errores['resolution'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Cerrando…' : 'Cerrar la marca'}</SubmitButton>
    </form>
  );
}
