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
  assessEvidenceAction,
  fileAppealAction,
  issueDecisionAction,
  notifyCaseAction,
  offerEvidenceAction,
  openCaseAction,
  recordHearingAction,
  resolveAppealAction,
  type DisciplineFormState,
} from './actions';

const INICIAL: DisciplineFormState = { status: 'idle' };

function Aviso({ estado }: { estado: DisciplineFormState }) {
  return (
    <>
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo completar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
    </>
  );
}

/** Apertura del expediente, con el control de conflicto de interés. */
export function OpenCaseForm({
  membresias,
  organos,
  personas,
}: {
  membresias: readonly Option[];
  organos: readonly Option[];
  personas: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(openCaseAction, INICIAL);

  if (membresias.length === 0 || organos.length === 0) {
    return (
      <Notice tone="warning" title="Falta el sujeto o el órgano">
        <p>Un procedimiento disciplinario se sigue a una persona agremiada y lo instruye un órgano activo.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-5">
      <Aviso estado={estado} />

      <Select
        name="membershipId"
        label="Persona señalada"
        required
        options={membresias}
        errors={estado.fieldErrors?.['membershipId']}
      />
      <Select
        name="instructingBodyId"
        label="Órgano que instruye"
        required
        options={organos}
        errors={estado.fieldErrors?.['instructingBodyId']}
      />
      <TextArea
        name="allegedFacts"
        label="Hechos imputados"
        required
        rows={6}
        hint="Concretos y fechados. Sin hechos concretos nadie puede defenderse."
        errors={estado.fieldErrors?.['allegedFacts']}
      />

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Control de conflicto de interés</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Cada persona que instruye declara si tiene interés en el asunto. Sin al menos una declaración no se abre el
          expediente, y si alguna declara conflicto, tampoco: hay que sustituirla antes.
        </p>
        {estado.fieldErrors?.['conflictOfInterestChecks'] !== undefined && (
          <ul className="space-y-1 text-sm text-[var(--color-danger)]">
            {estado.fieldErrors['conflictOfInterestChecks'].map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}
        {Array.from({ length: 3 }, (_, indice) => (
          <div key={indice} className="space-y-3 rounded-lg border border-[var(--color-line)] p-3">
            <Select
              name="instructorPersonId"
              label={`Quien instruye ${indice + 1}`}
              options={personas}
              placeholder="Sin usar"
            />
            <Field name="instructorRole" label="Papel en la instrucción" />
            <TextArea name="instructorStatement" label="Declaración" rows={2} />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="instructorConflict" value="si" className="size-4" />
              <span>Declara tener conflicto de interés</span>
            </label>
          </div>
        ))}
      </fieldset>

      <SubmitButton>{pendiente ? 'Abriendo…' : 'Abrir el expediente'}</SubmitButton>
    </form>
  );
}

/** Notificación, acceso al expediente y cita a audiencia. */
export function NotifyForm({ caseId }: { caseId: string }) {
  const [estado, accion, pendiente] = useActionState(notifyCaseAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="caseId" value={caseId} />
      <Aviso estado={estado} />

      <Field
        name="hearingAt"
        label="Audiencia"
        type="datetime-local"
        required
        hint="Tiene que dejar el plazo estatutario para contestar y ofrecer pruebas."
        errors={estado.fieldErrors?.['hearingAt']}
      />
      <TextArea name="note" label="Nota de la notificación" required rows={2} errors={estado.fieldErrors?.['note']} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Notificar abre también el acceso de la persona señalada a su expediente. Van juntos a propósito.
      </p>

      <SubmitButton>{pendiente ? 'Notificando…' : 'Notificar y citar a audiencia'}</SubmitButton>
    </form>
  );
}

/** Asiento de la audiencia. */
export function HearingForm({ caseId }: { caseId: string }) {
  const [estado, accion, pendiente] = useActionState(recordHearingAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="caseId" value={caseId} />
      <Aviso estado={estado} />

      <Select
        name="outcome"
        label="Resultado"
        required
        options={[
          { value: 'HELD', label: 'Se celebró' },
          { value: 'WAIVED', label: 'Renuncia expresa de la persona señalada' },
        ]}
        errors={estado.fieldErrors?.['outcome']}
      />
      <TextArea
        name="note"
        label="Constancia"
        required
        rows={4}
        hint="Qué ocurrió en la audiencia, o en qué términos se renunció a ella."
        errors={estado.fieldErrors?.['note']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Asentando…' : 'Asentar la audiencia'}</SubmitButton>
    </form>
  );
}

/** Ofrecimiento de prueba. */
export function EvidenceForm({ caseId, propia }: { caseId: string; propia: boolean }) {
  const [estado, accion, pendiente] = useActionState(offerEvidenceAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="offeredBy" value={propia ? 'MEMBER' : 'INSTRUCTING_BODY'} />
      <Aviso estado={estado} />

      <Select
        name="kind"
        label="Tipo de prueba"
        required
        options={[
          { value: 'DOCUMENT', label: 'Documental' },
          { value: 'TESTIMONY', label: 'Testimonial' },
          { value: 'RECORD', label: 'Registro' },
          { value: 'OTHER', label: 'Otra' },
        ]}
        errors={estado.fieldErrors?.['kind']}
      />
      <TextArea name="description" label="Descripción" required rows={3} errors={estado.fieldErrors?.['description']} />

      <div className="space-y-1.5">
        <label htmlFor={`prueba-${caseId}`} className="block text-sm font-medium">
          Archivo
        </label>
        <input id={`prueba-${caseId}`} type="file" name="file" className="block w-full text-sm" />
      </div>

      <SubmitButton variant="secondary">{pendiente ? 'Ofreciendo…' : 'Ofrecer la prueba'}</SubmitButton>
    </form>
  );
}

/** Valoración de una prueba. */
export function AssessEvidenceForm({ evidenceId }: { evidenceId: string }) {
  const [estado, accion, pendiente] = useActionState(assessEvidenceAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="evidenceId" value={evidenceId} />
      <Aviso estado={estado} />

      <Select
        name="admitted"
        label="Valoración"
        required
        options={[
          { value: 'si', label: 'Admitir' },
          { value: 'no', label: 'Desechar' },
        ]}
        errors={estado.fieldErrors?.['admitted']}
      />
      <TextArea
        name="admissionRationale"
        label="Razón"
        required
        rows={2}
        hint="Una prueba desechada sin razón es una defensa negada."
        errors={estado.fieldErrors?.['admissionRationale']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Valorando…' : 'Valorar'}</SubmitButton>
    </form>
  );
}

/** Resolución fundada. */
export function DecisionForm({
  caseId,
  organos,
  plantillas,
}: {
  caseId: string;
  organos: readonly Option[];
  plantillas: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(issueDecisionAction, INICIAL);

  if (plantillas.length === 0) {
    return (
      <Notice tone="warning" title="No hay plantilla publicada de resolución disciplinaria">
        <p>La resolución se emite con su documento. Publica una plantilla y vuelve.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="caseId" value={caseId} />
      <Aviso estado={estado} />

      <Select
        name="decidedByBodyId"
        label="Órgano que resuelve"
        required
        options={organos}
        errors={estado.fieldErrors?.['decidedByBodyId']}
      />
      <Select
        name="outcome"
        label="Resultado"
        required
        options={[
          { value: 'NO_LIABILITY', label: 'Sin responsabilidad' },
          { value: 'WARNING', label: 'Amonestación' },
          { value: 'SUSPENSION_OF_RIGHTS', label: 'Suspensión de derechos — con principio y fin' },
          { value: 'EXPULSION', label: 'Expulsión' },
          { value: 'OTHER_STATUTORY', label: 'Otra sanción estatutaria' },
        ]}
        errors={estado.fieldErrors?.['outcome']}
      />
      <TextArea
        name="rationale"
        label="Fundamento"
        required
        rows={10}
        hint="Sin razones escritas no es una resolución: es una orden."
        errors={estado.fieldErrors?.['rationale']}
      />
      <Field
        name="sanctionStartsOn"
        label="La sanción empieza el"
        type="date"
        errors={estado.fieldErrors?.['sanctionStartsOn']}
      />
      <Field
        name="sanctionEndsOn"
        label="Y termina el"
        type="date"
        hint="Obligatorio en una suspensión: una suspensión indefinida es una expulsión sin decirlo."
        errors={estado.fieldErrors?.['sanctionEndsOn']}
      />
      <Select
        name="templateCode"
        label="Plantilla de la resolución"
        required
        options={plantillas}
        errors={estado.fieldErrors?.['templateCode']}
      />

      <SubmitButton>{pendiente ? 'Dictando…' : 'Dictar la resolución'}</SubmitButton>
    </form>
  );
}

/** Interposición del recurso. */
export function AppealForm({ decisionId }: { decisionId: string }) {
  const [estado, accion, pendiente] = useActionState(fileAppealAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="decisionId" value={decisionId} />
      <Aviso estado={estado} />

      <TextArea
        name="grounds"
        label="Agravios"
        required
        rows={6}
        hint="Qué de la resolución se recurre y por qué."
        errors={estado.fieldErrors?.['grounds']}
      />

      <SubmitButton>{pendiente ? 'Interponiendo…' : 'Interponer el recurso'}</SubmitButton>
    </form>
  );
}

/** Resolución del recurso. */
export function AppealResolutionForm({ appealId, asambleas }: { appealId: string; asambleas: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(resolveAppealAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="appealId" value={appealId} />
      <Aviso estado={estado} />

      <Select
        name="status"
        label="Resultado"
        required
        options={[
          { value: 'ADMITTED', label: 'Admitido a trámite' },
          { value: 'INADMISSIBLE', label: 'Desechado' },
          { value: 'RESOLVED_CONFIRMED', label: 'Confirma la resolución' },
          { value: 'RESOLVED_MODIFIED', label: 'Modifica la resolución' },
          { value: 'RESOLVED_REVOKED', label: 'Revoca la resolución — restituye los derechos' },
        ]}
        errors={estado.fieldErrors?.['status']}
      />
      <Select
        name="resolvedByAssemblyId"
        label="Asamblea que lo resuelve"
        options={asambleas}
        placeholder="Ninguna"
        errors={estado.fieldErrors?.['resolvedByAssemblyId']}
      />
      <TextArea
        name="resolutionText"
        label="Texto de la resolución"
        required
        rows={6}
        errors={estado.fieldErrors?.['resolutionText']}
      />

      <SubmitButton>{pendiente ? 'Resolviendo…' : 'Resolver el recurso'}</SubmitButton>
    </form>
  );
}
