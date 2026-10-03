'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Notice,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  restoreBeneficiaryAction,
  revokeBeneficiaryAction,
  updateBeneficiaryAction,
  type BeneficiariaFormState,
} from '../actions';
import { MOTIVO_REVOCACION, PERFIL_PROTEGIDO, PRIVACIDAD } from '../../etiquetas';

const INICIAL: BeneficiariaFormState = { status: 'idle' };
const PERFILES: readonly Option[] = ['NEURODIVERGENT_PERSON', 'FAMILY_MEMBER', 'CAREGIVER'].map((value) => ({
  value,
  label: PERFIL_PROTEGIDO[value] ?? value,
}));
const PRIVACIDADES: readonly Option[] = ['REINFORCED', 'STANDARD'].map((value) => ({
  value,
  label: PRIVACIDAD[value] ?? value,
}));
const MOTIVOS: readonly Option[] = Object.entries(MOTIVO_REVOCACION).map(([value, label]) => ({ value, label }));

export function BeneficiaryManageForm({
  beneficiaryId,
  personas,
  territorios,
  actual,
}: {
  beneficiaryId: string;
  personas: readonly Option[];
  territorios: readonly Option[];
  actual: {
    profileKind: string;
    territorialUnitId: string;
    responsiblePersonId: string;
    privacyLevel: string;
  };
}) {
  const [estado, accion, pendiente] = useActionState(updateBeneficiaryAction, INICIAL);
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="beneficiaryId" value={beneficiaryId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo actualizar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Registro actualizado'} />}
      <Select name="profileKind" label="Perfil" required options={PERFILES} defaultValue={actual.profileKind} />
      <Select
        name="territorialUnitId"
        label="Territorio"
        options={territorios}
        defaultValue={actual.territorialUnitId}
        placeholder="Sin especificar"
        errors={estado.fieldErrors?.['territorialUnitId']}
      />
      <Select
        name="responsiblePersonId"
        label="Persona responsable"
        options={personas}
        defaultValue={actual.responsiblePersonId}
        placeholder="Ninguna"
        errors={estado.fieldErrors?.['responsiblePersonId']}
      />
      <Select
        name="privacyLevel"
        label="Privacidad"
        required
        options={PRIVACIDADES}
        defaultValue={actual.privacyLevel}
        errors={estado.fieldErrors?.['privacyLevel']}
      />
      <TextArea
        name="privacyChangeReason"
        label="Por qué se baja la privacidad"
        rows={2}
        hint="Obligatorio solo al pasar de reforzada a estándar; nunca se permite para una persona menor."
        errors={estado.fieldErrors?.['privacyChangeReason']}
      />
      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar cambios'}</SubmitButton>
    </form>
  );
}

export function RevokeBeneficiaryForm({ beneficiaryId }: { beneficiaryId: string }) {
  const [estado, accion, pendiente] = useActionState(revokeBeneficiaryAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Registro revocado'} />;
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="beneficiaryId" value={beneficiaryId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo revocar'} />}
      <Notice tone="danger" title="La revocación es inmediata">
        <p>Revoca la credencial y el acceso derivado de esta calidad. Los expedientes y su historial se conservan.</p>
      </Notice>
      <Select name="reasonKind" label="Tipo de motivo" required options={MOTIVOS} />
      <TextArea name="reason" label="Motivo detallado" required rows={3} errors={estado.fieldErrors?.['reason']} />
      <SubmitButton variant="danger">{pendiente ? 'Revocando…' : 'Revocar registro'}</SubmitButton>
    </form>
  );
}

export function RestoreBeneficiaryForm({ beneficiaryId }: { beneficiaryId: string }) {
  const [estado, accion, pendiente] = useActionState(restoreBeneficiaryAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Registro restaurado'} />;
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="beneficiaryId" value={beneficiaryId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo restaurar'} />}
      <TextArea name="reason" label="Motivo de la restauración" required rows={3} errors={estado.fieldErrors?.['reason']} />
      <SubmitButton>{pendiente ? 'Restaurando…' : 'Restaurar y emitir credencial nueva'}</SubmitButton>
    </form>
  );
}
