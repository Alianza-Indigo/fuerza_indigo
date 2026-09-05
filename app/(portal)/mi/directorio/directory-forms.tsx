'use client';

import { useActionState, useState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Notice,
  RadioGroup,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import {
  saveDirectoryPreferenceAction,
  withdrawDirectoryAction,
  type DirectorioPropioState,
} from './actions';

const INICIAL: DirectorioPropioState = { status: 'idle' };

/**
 * Lo que cada persona decide sobre su ficha pública (PRD §7.3).
 *
 * Las opciones se ofrecen **en orden creciente de exposición**, y cada una dice
 * qué implica en lugar de nombrarse a sí misma. «Perfil profesional» no le dice
 * nada a quien no sabe qué campos incluye eso.
 *
 * Los interruptores de foto, contacto e indexación solo aparecen si se va a
 * aparecer: marcarlos con «no aparecer» guardaría una autorización que no
 * autoriza nada.
 */
export function PreferenceForm({
  visibility,
  showPhoto,
  showProfessionalContact,
  allowSearchEngineIndexing,
}: {
  visibility: string;
  showPhoto: boolean;
  showProfessionalContact: boolean;
  allowSearchEngineIndexing: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(saveDirectoryPreferenceAction, INICIAL);
  const [eleccion, setEleccion] = useState(estado.values?.['visibility'] ?? visibility);
  const aparece = eleccion !== 'HIDDEN';

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Guardado'} />}

      <RadioGroup
        name="visibility"
        legend="Cuánto quieres que se vea"
        options={[
          {
            value: 'HIDDEN',
            label: 'No aparecer',
            hint: 'Nadie de fuera te encuentra. Es lo que pasa si no haces nada.',
          },
          {
            value: 'NAME_AND_TERRITORY',
            label: 'Solo mi nombre y mi territorio',
            hint: 'Aparece que perteneces y dónde. Nada más.',
          },
          {
            value: 'PROFESSIONAL_PROFILE',
            label: 'Mi perfil profesional',
            hint: 'Además, tu oficio, tu resumen, tus especialidades y tus habilidades verificadas.',
          },
        ]}
        value={eleccion}
        onChange={setEleccion}
        errors={estado.fieldErrors?.['visibility']}
      />

      {aparece && (
        <div className="space-y-3 rounded-lg border border-[var(--color-line)] p-4">
          <Checkbox name="showPhoto" label="Mostrar mi fotografía" defaultChecked={showPhoto} />
          <Checkbox
            name="showProfessionalContact"
            label="Mostrar mis medios profesionales de contacto"
            help="Tu correo y tu teléfono profesionales, si los tienes en tu perfil. Nunca los personales."
            defaultChecked={showProfessionalContact}
          />
          <Checkbox
            name="allowSearchEngineIndexing"
            label="Permitir que los buscadores me indexen"
            help="Sin esto tu ficha existe y se puede visitar, pero no sale en Google. Puedes cambiarlo cuando quieras."
            defaultChecked={allowSearchEngineIndexing}
          />
        </div>
      )}

      <Notice tone="neutral" title="Puedes retirarlo cuando quieras">
        <p>
          Retirar la autorización quita tu ficha de inmediato y le dice a los buscadores que dejen de
          mostrarla. No hace falta que expliques por qué a nadie.
        </p>
      </Notice>

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar mi decisión'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Guardando' : ''}</p>
    </form>
  );
}

/** Retiro de la autorización (F4-DIR-003). */
export function WithdrawForm() {
  const [estado, accion, pendiente] = useActionState(withdrawDirectoryAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Autorización retirada'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo retirar'} />}
      <TextArea
        name="reason"
        label="Si quieres, dinos por qué"
        required
        rows={2}
        hint="Nos sirve para mejorar. No cambia nada: se retira igual."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton variant="danger">
        {pendiente ? 'Retirando…' : 'Retirar mi ficha del directorio público'}
      </SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Retirando' : ''}</p>
    </form>
  );
}
