'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  type Option,
} from '@/design-system/primitives';
import { registerBeneficiaryAction, type BeneficiariaFormState } from './actions';
import { ORIGEN, PERFIL_PROTEGIDO } from '../etiquetas';

const INICIAL: BeneficiariaFormState = { status: 'idle' };

const ORIGENES: readonly Option[] = [
  { value: 'SELF', label: ORIGEN['SELF']!, hint: 'Se registró ella misma.' },
  { value: 'FAMILY_OR_CAREGIVER', label: ORIGEN['FAMILY_OR_CAREGIVER']! },
  { value: 'UNION_MEMBER', label: ORIGEN['UNION_MEMBER']! },
  { value: 'DELEGATE', label: ORIGEN['DELEGATE']! },
  { value: 'SOCIAL_STAFF', label: ORIGEN['SOCIAL_STAFF']! },
  { value: 'EXTERNAL_REFERRAL', label: ORIGEN['EXTERNAL_REFERRAL']!, hint: 'Escuela, hospital, otra organización.' },
];

const PERFILES: readonly Option[] = [
  { value: 'NEURODIVERGENT_PERSON', label: PERFIL_PROTEGIDO['NEURODIVERGENT_PERSON']! },
  { value: 'FAMILY_MEMBER', label: PERFIL_PROTEGIDO['FAMILY_MEMBER']! },
  { value: 'CAREGIVER', label: PERFIL_PROTEGIDO['CAREGIVER']! },
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
  const dato = (campo: string): string | undefined => estado.values?.[campo];
  const clave = estado.status === 'idle' ? 'inicial' : JSON.stringify(estado.values ?? {});

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Registro creado'} />}

      <div key={clave} className="space-y-5">
        <Select
          name="personId"
          label="Persona que quedará protegida"
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
          name="profileKind"
          legend="Perfil"
          options={PERFILES}
          value={dato('profileKind')}
          errors={estado.fieldErrors?.['profileKind']}
        />
        <RadioGroup
          name="originKind"
          legend="Por dónde llegó"
          help="Saber por qué puerta entró cambia a quién hay que avisar."
          options={ORIGENES}
          value={dato('originKind')}
          errors={estado.fieldErrors?.['originKind']}
        />
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

      <SubmitButton>{pendiente ? 'Registrando…' : 'Crear registro protegido'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Registrando' : ''}</p>
    </form>
  );
}
