'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ErrorNotice, Notice, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import type { CaseDomain, SupportRequestType } from '@prisma-client/enums';
import { openCaseAction, type RequestState } from '../actions';

const INICIAL: RequestState = { status: 'idle' };

/**
 * Apertura del expediente desde un mensaje ya canalizado (PRD §10.2).
 *
 * No pregunta el relato: lo copia del mensaje. Lo que la persona escribió es lo
 * que queda como relato original del expediente, y reescribirlo aquí sería
 * sustituir su versión por la de quien la atiende antes siquiera de empezar.
 */
export function OpenCaseForm({
  requestId,
  legalEntityId,
  domain,
  caseType,
}: {
  requestId: string;
  legalEntityId: string;
  domain: CaseDomain;
  caseType: SupportRequestType;
}) {
  const [estado, accion, pendiente] = useActionState(openCaseAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return (
      <SuccessNotice title={estado.message ?? 'Expediente abierto'}>
        <Link href="/casos" className="underline underline-offset-4">
          Ir a mis expedientes
        </Link>
      </SuccessNotice>
    );
  }

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}

      <input type="hidden" name="supportRequestId" value={requestId} />
      <input type="hidden" name="legalEntityId" value={legalEntityId} />
      <input type="hidden" name="domain" value={domain} />
      <input type="hidden" name="caseType" value={caseType} />

      <Notice title="El relato se copia tal cual" tone="accent" live="none">
        <p>
          Lo que la persona escribió pasa al expediente sin tocarse y ya no se puede editar. Tu valoración se escribe
          aparte, dentro del expediente.
        </p>
      </Notice>

      <RadioGroup
        name="priority"
        legend="¿Con qué prioridad entra?"
        options={[
          { value: 'LOW', label: 'Baja' },
          { value: 'NORMAL', label: 'Normal' },
          { value: 'HIGH', label: 'Alta', hint: 'Hay un plazo que se pierde o un daño que crece.' },
          { value: 'CRITICAL', label: 'Crítica', hint: 'Hay riesgo para una persona ahora mismo.' },
        ]}
        value="NORMAL"
        {...(errores['priority'] === undefined ? {} : { errors: errores['priority'] })}
      />

      <TextArea
        name="reason"
        label="¿Por qué se abre expediente?"
        hint="Queda en la bitácora. Con una línea basta."
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Abriendo…' : 'Abrir el expediente'}</SubmitButton>
    </form>
  );
}
