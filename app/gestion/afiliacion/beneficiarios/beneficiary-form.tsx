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
  type Option,
} from '@/design-system/primitives';
import { registerBeneficiaryAction, type BeneficiariaFormState } from './actions';
import { ORIGEN, URGENCIA } from '../etiquetas';

const INICIAL: BeneficiariaFormState = { status: 'idle' };

const ORIGENES: readonly Option[] = [
  { value: 'SELF', label: ORIGEN['SELF']!, hint: 'Se registró ella misma.' },
  { value: 'FAMILY_OR_CAREGIVER', label: ORIGEN['FAMILY_OR_CAREGIVER']! },
  { value: 'UNION_MEMBER', label: ORIGEN['UNION_MEMBER']! },
  { value: 'DELEGATE', label: ORIGEN['DELEGATE']! },
  { value: 'SOCIAL_STAFF', label: ORIGEN['SOCIAL_STAFF']! },
  { value: 'CIAN', label: ORIGEN['CIAN']! },
  { value: 'EXTERNAL_REFERRAL', label: ORIGEN['EXTERNAL_REFERRAL']!, hint: 'Escuela, hospital, otra organización.' },
];

const URGENCIAS: readonly Option[] = [
  { value: 'ROUTINE', label: URGENCIA['ROUTINE']!, hint: 'Se atiende en el orden habitual.' },
  { value: 'PRIORITY', label: URGENCIA['PRIORITY']!, hint: 'Pasa delante en la cola.' },
  {
    value: 'URGENT',
    label: URGENCIA['URGENT']!,
    hint: 'Requiere atención inmediata. Si hay peligro para la vida, llama al 911 además de registrar aquí.',
  },
];

/**
 * Alta de una persona beneficiaria protegida (PRD §3.4, §8.3).
 *
 * Atención sin afiliación y sin pago: esta pantalla no pregunta por cuotas
 * porque no las hay, y no ofrece calidad de membresía porque no la concede.
 *
 * La privacidad empieza reforzada. Bajarla exige explicarlo, y para una persona
 * menor de edad no se puede bajar: el caso de uso lo rechaza, aunque la pantalla
 * lo ofreciera.
 */
export function BeneficiaryForm({
  personas,
  entidades,
  territorios,
}: {
  personas: readonly Option[];
  entidades: readonly Option[];
  territorios: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(registerBeneficiaryAction, INICIAL);
  const [urgencia, setUrgencia] = useState('ROUTINE');

  const dato = (campo: string): string | undefined => estado.values?.[campo];
  const clave = estado.status === 'idle' ? 'inicial' : JSON.stringify(estado.values ?? {});

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Atención registrada'} />}

      <div key={clave} className="space-y-5">
        <Select
          name="personId"
          label="Persona que va a recibir atención"
          required
          hint="Tiene que estar en el registro maestro. Si no está, regístrala primero: no hace falta que tenga cuenta."
          options={personas}
          defaultValue={dato('personId')}
          errors={estado.fieldErrors?.['personId']}
        />
        <Select
          name="legalEntityId"
          label="Entidad que se hace cargo"
          required
          options={entidades}
          defaultValue={dato('legalEntityId')}
          errors={estado.fieldErrors?.['legalEntityId']}
        />
        <RadioGroup
          name="originKind"
          legend="Por dónde llegó"
          help="Saber por qué puerta entró cambia a quién hay que avisar."
          options={ORIGENES}
          value={dato('originKind')}
          errors={estado.fieldErrors?.['originKind']}
        />
        <TextArea
          name="initialNeed"
          label="Con qué necesita ayuda"
          required
          rows={5}
          hint="Con sus palabras, hasta donde se pueda. No hace falta clasificarlo ahora."
          defaultValue={dato('initialNeed')}
          errors={estado.fieldErrors?.['initialNeed']}
        />
        <RadioGroup
          name="urgencyLevel"
          legend="Urgencia"
          options={URGENCIAS}
          value={urgencia}
          onChange={setUrgencia}
          errors={estado.fieldErrors?.['urgencyLevel']}
        />
        {urgencia === 'URGENT' && (
          <Notice tone="danger" title="Si hay peligro inmediato, llama al 911">
            <p>
              Este registro no es un canal de urgencias y no está atendido las veinticuatro horas. Regístralo
              igual, y llama.
            </p>
          </Notice>
        )}
        <Select
          name="territorialUnitId"
          label="Territorio"
          hint="Opcional."
          options={territorios}
          defaultValue={dato('territorialUnitId') ?? ''}
          placeholder="Sin especificar"
          errors={estado.fieldErrors?.['territorialUnitId']}
        />
        <Select
          name="responsiblePersonId"
          label="Persona responsable"
          hint="Obligatoria si es menor de edad o si requiere representación."
          options={personas}
          defaultValue={dato('responsiblePersonId') ?? ''}
          placeholder="Ninguna"
          errors={estado.fieldErrors?.['responsiblePersonId']}
        />
        <input type="hidden" name="privacyLevel" value="REINFORCED" />
      </div>

      <Notice tone="neutral" title="La privacidad empieza reforzada">
        <p>
          Lo que esta persona cuente no aparecerá en listados ni en exportaciones. Se puede bajar a estándar
          después, explicando por qué, y nunca para una persona menor de edad.
        </p>
      </Notice>

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar la atención'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Registrando' : ''}</p>
    </form>
  );
}
