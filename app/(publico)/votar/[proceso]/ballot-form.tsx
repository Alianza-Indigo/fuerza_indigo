'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Notice,
  RadioGroup,
  SubmitButton,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import { castBallotAction, type BallotFormState } from './actions';

const INICIAL: BallotFormState = { status: 'idle' };

/**
 * Papeleta.
 *
 * Cuando el depósito se completa, la pantalla deja de mostrar la papeleta y
 * enseña solo el código de verificación. No se ofrece «votar otra vez» ni se
 * recuerda lo elegido: la boleta ya salió de aquí y no vuelve.
 */
export function BallotForm({
  voteProcessId,
  opciones,
}: {
  voteProcessId: string;
  opciones: readonly { code: string; label: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(castBallotAction, INICIAL);

  if (estado.status === 'ok' && estado.verificationCode !== undefined) {
    return (
      <Notice tone="success" title="Tu voto quedó depositado">
        <p>Guarda este código. Con él comprobarás, en la lista que se publique al escrutar, que tu boleta se contó.</p>
        <p className="mt-3 font-mono text-2xl tracking-wide break-all">{estado.verificationCode}</p>
        <p className="mt-3 text-sm">
          La lista publicará los códigos contados, <strong>no</strong> el sentido de cada uno. Nadie —tampoco esta
          plataforma— puede decir qué votaste, y tú tampoco puedes demostrarlo ante quien te lo exija. Eso es lo que
          protege tu voto.
        </p>
      </Notice>
    );
  }

  const seleccion: readonly Option[] = [
    ...opciones.map((opcion) => ({ value: opcion.code, label: opcion.label })),
    { value: 'EN_BLANCO', label: 'En blanco', hint: 'Se cuenta como boleta depositada y como voto en blanco.' },
  ];

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name="voteProcessId" value={voteProcessId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo depositar'} />}

      <TextArea
        name="credential"
        label="Tu credencial de voto"
        required
        rows={3}
        hint="Pégala tal como la recibiste. Es lo único que autoriza el depósito: no te pedimos entrar con tu cuenta, porque saber quién abre la papeleta permitiría deducir qué boleta es la suya."
        errors={estado.fieldErrors?.['credential']}
      />

      <RadioGroup
        name="optionCode"
        legend="Tu voto"
        options={seleccion}
        errors={estado.fieldErrors?.['optionCode']}
      />

      <SubmitButton>{pendiente ? 'Depositando…' : 'Depositar mi voto'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Depositando el voto' : ''}
      </p>
    </form>
  );
}
