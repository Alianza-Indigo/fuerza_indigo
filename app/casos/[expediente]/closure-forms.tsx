'use client';

import { useActionState, useState } from 'react';
import { ErrorNotice, Notice, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import type { CaseOutcome } from '@prisma-client/enums';
import {
  NOMBRE_DE_RESULTADO,
  QUE_SIGNIFICA_EL_RESULTADO,
  RESULTADOS_QUE_ADMITEN_REAPERTURA,
} from '@/modules/cases/domain';
import { closeCaseAction, reopenCaseAction, type CaseFormState } from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

const RESULTADOS: readonly CaseOutcome[] = [
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'REFERRED',
  'WITHDRAWN_BY_PERSON',
  'NOT_COMPETENT',
  'NO_CONTACT',
];

/**
 * Cierre del expediente (PRD §10.2).
 *
 * El resultado se elige de una lista cerrada y el motivo se escribe, porque un
 * expediente cerrado sin decir qué pasó no se distingue de uno abandonado. La
 * pantalla avisa además de lo que el cierre implica: hay resultados que no
 * admiten reapertura, y conviene saberlo **antes** de elegirlos.
 */
export function CloseCaseForm({ caseId }: { caseId: string }) {
  const [estado, accion, pendiente] = useActionState(closeCaseAction, INICIAL);
  const [resultado, setResultado] = useState<CaseOutcome>('RESOLVED');
  const errores = estado.fieldErrors ?? {};

  const seReabre = RESULTADOS_QUE_ADMITEN_REAPERTURA.includes(resultado);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Cerrado'} />;

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}

      <input type="hidden" name="caseId" value={caseId} />

      <RadioGroup
        name="outcome"
        legend="¿Cómo acabó?"
        help="Es lo que va a decir el indicador dentro de tres años."
        options={RESULTADOS.map((valor) => ({
          value: valor,
          label: NOMBRE_DE_RESULTADO[valor],
          hint: QUE_SIGNIFICA_EL_RESULTADO[valor],
        }))}
        value={resultado}
        onChange={(valor) => setResultado(valor as CaseOutcome)}
        {...(errores['outcome'] === undefined ? {} : { errors: errores['outcome'] })}
      />

      {!seReabre && (
        <Notice title="Este cierre no se reabre" tone="warning" live="status">
          <p>
            Si el asunto no es competencia de la organización, reabrirlo después no la vuelve competente. Lo que
            procede entonces es abrirlo donde corresponda o canalizarlo, y las dos cosas se pueden hacer desde aquí.
          </p>
        </Notice>
      )}

      {resultado === 'REFERRED' && (
        <Notice title="Alguien tiene que haberla aceptado" tone="accent" live="status">
          <p>
            Solo se cierra así cuando un área receptora aceptó la canalización. Si nadie la aceptó todavía, cerrarlo
            diría que alguien se hizo cargo cuando el asunto está sin atender en los dos lados.
          </p>
        </Notice>
      )}

      <TextArea
        name="reason"
        label="¿Qué pasó?"
        hint="Con lo que haga falta para entenderlo dentro de tres años, sin abrir nada más."
        required
        rows={4}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Cerrando…' : 'Cerrar el expediente'}</SubmitButton>
    </form>
  );
}

/** Reapertura, con su motivo. La cuenta de veces sube y consta. */
export function ReopenCaseForm({ caseId, veces }: { caseId: string; veces: number }) {
  const [estado, accion, pendiente] = useActionState(reopenCaseAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Reabierto'} />;

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="caseId" value={caseId} />
      {veces > 0 && (
        <Notice title={`Este expediente ya se reabrió ${veces} vez/veces`} tone="warning" live="none">
          <p>
            Reabrir el mismo asunto muchas veces suele querer decir que no se resolvió, no que vuelva a pasar. La
            cuenta queda a la vista para poder verlo.
          </p>
        </Notice>
      )}
      <TextArea
        name="reason"
        label="¿Por qué se reabre?"
        hint="Queda en la bitácora, junto con el resultado con el que se había cerrado."
        required
        rows={3}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Reabriendo…' : 'Reabrir el expediente'}</SubmitButton>
    </form>
  );
}
