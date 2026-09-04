'use client';

import { useActionState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Notice,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import { saveOrSubmitAssistedAction, type AsistidaFormState } from '../actions';

const INICIAL: AsistidaFormState = { status: 'idle' };

const FORMAS: readonly Option[] = [
  { value: 'SUBORDINATE', label: 'Por cuenta ajena, con patrón' },
  { value: 'INDEPENDENT', label: 'De forma independiente' },
  { value: 'AUTONOMOUS', label: 'De forma autónoma' },
  { value: 'SELF_EMPLOYED', label: 'Por cuenta propia' },
];

const SINDICATOS: readonly Option[] = [
  { value: 'NONE', label: 'No pertenece a ningún otro sindicato' },
  { value: 'SAME_TRADE', label: 'Sí, de su mismo gremio' },
  { value: 'DIFFERENT_TRADE', label: 'Sí, de otro gremio' },
];

const PERFILES: readonly Option[] = [
  { value: 'NEURODIVERGENT_PERSON', label: 'Persona neurodivergente' },
  { value: 'FAMILY_MEMBER', label: 'Familiar' },
  { value: 'CAREGIVER', label: 'Persona cuidadora' },
];

/**
 * Captura asistida de una solicitud (PRD §8.1, paso 2).
 *
 * Dos botones sobre el mismo formulario: guardar deja el borrador en el
 * servidor, enviar lo cierra con su resumen inmutable. El borrador sí vive en el
 * servidor aquí, y no como en la vía propia: estos datos ya se los dio la
 * persona a la organización, y perderlos a media captura sería obligarla a
 * contarlo todo otra vez.
 *
 * Quien captura una afiliación honoraria **no ve** los campos laborales.
 */
export function AssistedForm({
  applicationId,
  personId,
  membershipTypeId,
  category,
  especialidades,
  territorios,
  borrador,
}: {
  applicationId: string;
  personId: string;
  membershipTypeId: string;
  category: 'UNION_MEMBER' | 'HONORARY_AFFILIATE';
  especialidades: readonly Option[];
  territorios: readonly Option[];
  borrador: Record<string, string>;
}) {
  const [estado, accion, pendiente] = useActionState(saveOrSubmitAssistedAction, INICIAL);
  const sindical = category === 'UNION_MEMBER';

  const dato = (campo: string): string | undefined => estado.values?.[campo] ?? borrador[campo];
  const clave = estado.status === 'idle' ? 'inicial' : JSON.stringify(estado.values ?? {});

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Solicitud enviada'} />;
  }

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="membershipTypeId" value={membershipTypeId} />
      <input type="hidden" name="category" value={category} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}
      {estado.status === 'guardado' && <SuccessNotice title={estado.message ?? 'Borrador guardado'} />}

      <div key={clave} className="space-y-5">
        {sindical ? (
          <>
            <Select
              name="occupationSpecialtyId"
              label="Oficio, profesión o disciplina"
              options={especialidades}
              defaultValue={dato('occupationSpecialtyId') ?? ''}
              errors={estado.fieldErrors?.['occupationSpecialtyId']}
            />
            <Select
              name="workRelationKind"
              label="Cómo trabaja"
              options={FORMAS}
              defaultValue={dato('workRelationKind') ?? ''}
              errors={estado.fieldErrors?.['workRelationKind']}
            />
            <TextArea
              name="neurodivergentContactStatement"
              label="Cómo se relaciona su actividad con personas neurodivergentes"
              rows={5}
              hint="Con sus palabras, no con las de quien captura."
              defaultValue={dato('neurodivergentContactStatement') ?? ''}
              errors={estado.fieldErrors?.['neurodivergentContactStatement']}
            />
            <Select
              name="otherUnionMembership"
              label="¿Pertenece a otro sindicato?"
              options={SINDICATOS}
              defaultValue={dato('otherUnionMembership') ?? ''}
              errors={estado.fieldErrors?.['otherUnionMembership']}
            />
            <TextArea
              name="otherUnionClarification"
              label="Aclaración sobre ese otro sindicato"
              rows={3}
              hint="Obligatoria si pertenece a otro sindicato: cuál, desde cuándo y si sigue afiliada."

              defaultValue={dato('otherUnionClarification') ?? ''}
              errors={estado.fieldErrors?.['otherUnionClarification']}
            />
          </>
        ) : (
          <>
            <Select
              name="honoraryProfile"
              label="Desde qué perfil se afilia"
              options={PERFILES}
              defaultValue={dato('honoraryProfile') ?? ''}
              errors={estado.fieldErrors?.['honoraryProfile']}
            />
            <TextArea
              name="neurodivergentContactStatement"
              label="Lo que quiera contarnos"
              rows={4}
              hint="Opcional. No hace falta justificar nada para una afiliación honoraria."
              defaultValue={dato('neurodivergentContactStatement') ?? ''}
              errors={estado.fieldErrors?.['neurodivergentContactStatement']}
            />
          </>
        )}

        <Select
          name="territorialUnitId"
          label="Unidad territorial"
          hint="Opcional."
          options={territorios}
          defaultValue={dato('territorialUnitId') ?? ''}
          placeholder="Sin especificar"
          errors={estado.fieldErrors?.['territorialUnitId']}
        />
      </div>

      <Notice tone="warning" title="La aceptación la da la persona, no quien captura">
        <p>
          Marca esta casilla solo si la persona leyó o le leíste los estatutos y los avisos, y dijo que sí.
          Queda registrado quién envió la solicitud en su nombre.
        </p>
        <div className="mt-3">
          <Checkbox
            name="acceptsStatutes"
            label="La persona acepta los estatutos, los avisos y las declaraciones aplicables"
          />
        </div>
      </Notice>

      <div className="flex flex-wrap gap-3">
        <SubmitButton variant="secondary" name="intent" value="guardar">
          Guardar borrador
        </SubmitButton>
        <SubmitButton name="intent" value="enviar">
          {pendiente ? 'Guardando…' : 'Enviar la solicitud'}
        </SubmitButton>
      </div>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Guardando' : ''}
      </p>
    </form>
  );
}
