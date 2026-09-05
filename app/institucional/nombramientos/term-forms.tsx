'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Field,
  Notice,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  appointOfficeAction,
  endOfficeTermAction,
  grantPowerAction,
  revokePowerAction,
  type TermFormState,
} from './actions';

const INICIAL: TermFormState = { status: 'idle' };

const METODOS: readonly Option[] = [
  { value: 'ELECTION', label: 'Elección' },
  { value: 'ASSEMBLY_APPOINTMENT', label: 'Designación por asamblea' },
  { value: 'SUBSTITUTION', label: 'Suplencia' },
  { value: 'INTERIM', label: 'Interinato' },
];

const PODERES: readonly Option[] = [
  { value: 'LEGAL_REPRESENTATION', label: 'Representación legal' },
  { value: 'BANKING', label: 'Actos bancarios' },
  { value: 'LABOR_AUTHORITY', label: 'Trámites ante la autoridad laboral' },
  { value: 'ADMINISTRATIVE', label: 'Actos administrativos' },
  { value: 'SPECIAL', label: 'Poder especial' },
];

/** Designación en un cargo. */
export function AppointForm({
  cargos,
  personas,
  territorios,
  periodos,
}: {
  cargos: readonly Option[];
  personas: readonly Option[];
  territorios: readonly Option[];
  periodos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(appointOfficeAction, INICIAL);

  if (cargos.length === 0) {
    return (
      <Notice tone="warning" title="Todavía no hay cargos definidos">
        <p>Define los cargos del órgano antes de nombrar a nadie.</p>
      </Notice>
    );
  }
  if (personas.length === 0) {
    return (
      <Notice tone="warning" title="No hay agremiados en pleno goce de derechos">
        <p>
          Un cargo lo ocupa quien es agremiado, con la membresía activa y sin los derechos políticos suspendidos.
          Mientras no exista ninguno, nombrar sería un acto sin sujeto.
        </p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo nombrar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Select
        name="officeDefinitionId"
        label="Cargo"
        required
        options={cargos}
        errors={estado.fieldErrors?.['officeDefinitionId']}
      />
      <Select
        name="membershipId"
        label="Persona"
        required
        options={personas}
        hint="Solo aparecen agremiados en pleno goce de derechos."
        errors={estado.fieldErrors?.['membershipId']}
      />
      <Select
        name="designationMethod"
        label="Forma de designación"
        required
        options={METODOS}
        errors={estado.fieldErrors?.['designationMethod']}
      />
      <Select
        name="territorialUnitId"
        label="Unidad territorial"
        options={territorios}
        placeholder="Sin acotar a una unidad"
        hint="Para delegaciones y secciones."
        errors={estado.fieldErrors?.['territorialUnitId']}
      />
      <Select
        name="substitutedTermId"
        label="Periodo al que suple"
        options={periodos}
        placeholder="No es una suplencia"
        hint="Solo para suplencias e interinatos."
        errors={estado.fieldErrors?.['substitutedTermId']}
      />
      <Field
        name="startsOn"
        label="Toma posesión el"
        type="date"
        required
        hint="El término se calcula con la duración estatutaria del cargo."
        errors={estado.fieldErrors?.['startsOn']}
      />
      <TextArea
        name="reason"
        label="Motivo del nombramiento"
        required
        rows={2}
        hint="Queda en la bitácora."
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton>{pendiente ? 'Nombrando…' : 'Registrar el nombramiento'}</SubmitButton>
    </form>
  );
}

/** Conclusión anticipada de un periodo. */
export function EndTermForm({ officeTermId, personName }: { officeTermId: string; personName: string }) {
  const [estado, accion, pendiente] = useActionState(endOfficeTermAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="officeTermId" value={officeTermId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo concluir'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field name="endedOn" label="Concluye el" type="date" required errors={estado.fieldErrors?.['endedOn']} />
      <TextArea
        name="reason"
        label={`Motivo para concluir el periodo de ${personName}`}
        required
        rows={2}
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton variant="danger">{pendiente ? 'Concluyendo…' : 'Concluir el periodo'}</SubmitButton>
    </form>
  );
}

/** Otorgamiento de un poder, con su documento probatorio. */
export function GrantPowerForm({
  periodos,
  personas,
  plantillas,
}: {
  periodos: readonly Option[];
  personas: readonly Option[];
  plantillas: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(grantPowerAction, INICIAL);

  if (periodos.length === 0) {
    return (
      <Notice tone="warning" title="No hay cargos vigentes">
        <p>Un poder sale de un cargo en funciones. Sin cargo vigente no hay quién otorgue.</p>
      </Notice>
    );
  }
  if (plantillas.length === 0) {
    return (
      <Notice tone="warning" title="No hay plantilla publicada de poder">
        <p>
          Un poder sin documento probatorio no es un poder. Publica una plantilla de tipo «poder» en la sección de
          plantillas y vuelve.
        </p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo otorgar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Select
        name="officeTermId"
        label="Cargo que otorga"
        required
        options={periodos}
        errors={estado.fieldErrors?.['officeTermId']}
      />
      <Select
        name="granteePersonId"
        label="Persona apoderada"
        required
        options={personas}
        hint="No tiene por qué ser agremiada: puede ser abogacía externa."
        errors={estado.fieldErrors?.['granteePersonId']}
      />
      <Select name="powerKind" label="Tipo de poder" required options={PODERES} errors={estado.fieldErrors?.['powerKind']} />
      <TextArea
        name="scope"
        label="Alcance"
        required
        rows={4}
        hint="Qué puede hacer la persona apoderada y qué no. Se copia al documento."
        errors={estado.fieldErrors?.['scope']}
      />
      <Field
        name="notaryReference"
        label="Referencia notarial"
        hint="Opcional. Escritura, notaría y fecha, si el poder se protocolizó."
        errors={estado.fieldErrors?.['notaryReference']}
      />
      <Field name="startsOn" label="Desde" type="date" required errors={estado.fieldErrors?.['startsOn']} />
      <Field
        name="endsOn"
        label="Hasta"
        type="date"
        hint="Déjalo en blanco y se acota solo al término del cargo. Un poder no sobrevive al cargo que lo otorgó."
        errors={estado.fieldErrors?.['endsOn']}
      />
      <Select
        name="templateCode"
        label="Plantilla del documento"
        required
        options={plantillas}
        errors={estado.fieldErrors?.['templateCode']}
      />
      <TextArea name="reason" label="Motivo" required rows={2} errors={estado.fieldErrors?.['reason']} />

      <SubmitButton>{pendiente ? 'Otorgando…' : 'Otorgar el poder'}</SubmitButton>
    </form>
  );
}

/** Revocación de un poder. */
export function RevokePowerForm({ powerGrantId, granteeName }: { powerGrantId: string; granteeName: string }) {
  const [estado, accion, pendiente] = useActionState(revokePowerAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="powerGrantId" value={powerGrantId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo revocar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <Field name="revokedOn" label="Revocado el" type="date" required errors={estado.fieldErrors?.['revokedOn']} />
      <TextArea
        name="reason"
        label={`Motivo para revocar el poder de ${granteeName}`}
        required
        rows={2}
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton variant="danger">{pendiente ? 'Revocando…' : 'Revocar el poder'}</SubmitButton>
    </form>
  );
}
