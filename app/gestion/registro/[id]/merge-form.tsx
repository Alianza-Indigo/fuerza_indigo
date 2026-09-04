'use client';

import { useActionState } from 'react';
import {
  EmptyState,
  ErrorNotice,
  RadioGroup,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import { mergePeopleAction, type RegistroFormState } from '../actions';

const INICIAL: RegistroFormState = { status: 'idle' };

/**
 * Fusión de dos registros de la misma persona (PRD §3.1).
 *
 * El registro duplicado no se borra: queda marcado como fusionado y apuntando
 * al que se conserva. Un identificador que ya circuló tiene que seguir
 * resolviendo a algo, y ese algo tiene que decir a dónde fue la persona.
 *
 * **El aviso de resultado vive fuera de la lista de candidatas y no dentro.**
 * Una fusión correcta deja la lista vacía, así que un mensaje pintado dentro de
 * ella desaparecería en el mismo instante en que hay algo que decir: la
 * pantalla cambiaba sin avisar y quien acababa de fusionar dos registros no
 * sabía si lo había hecho (defecto `D-F4-006`).
 */
export function MergeForm({
  keepPersonId,
  candidatas,
}: {
  keepPersonId: string;
  candidatas: readonly { value: string; label: string; hint?: string | undefined }[];
}) {
  const [estado, accion, pendiente] = useActionState(mergePeopleAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="keepPersonId" value={keepPersonId} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo fusionar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Registros fusionados'} />}

      {candidatas.length === 0 ? (
        <EmptyState
          title="No se parece a ningún otro registro"
          description="Nada que fusionar por ahora."
        />
      ) : (
        <>
          <RadioGroup
            name="mergePersonId"
            legend="Registro duplicado"
            help="Es el que dejará de usarse. Todo lo suyo pasa a este registro."
            options={candidatas}
            errors={estado.fieldErrors?.['mergePersonId']}
          />

          <TextArea
            name="reason"
            label="En qué te basas para afirmar que son la misma persona"
            required
            rows={3}
            hint="Mínimo veinte caracteres. Queda en la bitácora con tu nombre."
            errors={estado.fieldErrors?.['reason']}
          />

          <SubmitButton variant="danger">{pendiente ? 'Fusionando…' : 'Fusionar registros'}</SubmitButton>
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Fusionando los registros' : ''}
      </p>
    </form>
  );
}
