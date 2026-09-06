'use client';

import { useActionState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Field,
  Notice,
  ScrollableTable,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  advanceElectionAction,
  assignCommissionAction,
  certifyElectionVoteAction,
  closeElectionVoteAction,
  createElectionAction,
  decideSlateAction,
  exportEvidenceAction,
  freezeElectionRosterAction,
  issueElectionCallAction,
  issueElectionCredentialsAction,
  openIncidentAction,
  publishRollAction,
  registerSlateAction,
  resolveIncidentAction,
  scheduleElectionVoteAction,
  tallyElectionVoteAction,
  type ElectionFormState,
} from './actions';

const INICIAL: ElectionFormState = { status: 'idle' };

const ETAPAS: readonly { code: string; label: string }[] = [
  { code: 'CALL', label: 'Convocatoria' },
  { code: 'REGISTRATION', label: 'Registro de planillas' },
  { code: 'REVIEW', label: 'Revisión de requisitos' },
  { code: 'CAMPAIGN', label: 'Campaña' },
  { code: 'VOTING', label: 'Jornada de votación' },
  { code: 'TALLY', label: 'Escrutinio' },
  { code: 'RESULTS', label: 'Declaración de resultados' },
  { code: 'CHALLENGES', label: 'Impugnaciones' },
];

function Aviso({ estado }: { estado: ElectionFormState }) {
  return (
    <>
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo completar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
      {estado.warnings !== undefined && estado.warnings.length > 0 && (
        <Notice tone="warning" title="Advertencias de la planilla">
          <ul className="list-inside list-disc space-y-1">
            {estado.warnings.map((alerta) => (
              <li key={alerta.codigo}>{alerta.mensaje}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            El sistema alerta; la determinación formal corresponde a la Comisión Electoral. Las advertencias quedan
            guardadas con la planilla.
          </p>
        </Notice>
      )}
    </>
  );
}

/** Alta de un proceso electoral con su calendario. */
export function CreateElectionForm({
  organos,
  territorios,
}: {
  organos: readonly Option[];
  territorios: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(createElectionAction, INICIAL);

  if (organos.length === 0) {
    return (
      <Notice tone="warning" title="No hay órganos activos">
        <p>Una elección renueva un órgano. Instálalo antes.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-5">
      <Aviso estado={estado} />

      <Field name="name" label="Nombre del proceso" required errors={estado.fieldErrors?.['name']} />
      <Select name="unionBodyId" label="Órgano que se renueva" required options={organos} errors={estado.fieldErrors?.['unionBodyId']} />
      <Select
        name="territorialUnitId"
        label="Unidad territorial"
        required
        options={territorios}
        errors={estado.fieldErrors?.['territorialUnitId']}
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Calendario electoral</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Deja en blanco las etapas que no apliquen. Las que pongas tienen que ir en orden de fecha: un registro que
          abre después de la jornada no se puede cumplir.
        </p>
        {estado.fieldErrors?.['calendar'] !== undefined && (
          <ul className="space-y-1 text-sm text-[var(--color-danger)]">
            {estado.fieldErrors['calendar'].map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}
        {ETAPAS.map((etapa) => (
          <div key={etapa.code}>
            <input type="hidden" name="etapaCode" value={etapa.code} />
            <Field name="etapaFecha" label={etapa.label} type="date" />
          </div>
        ))}
      </fieldset>

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar el proceso'}</SubmitButton>
    </form>
  );
}

/** Integración de la Comisión Electoral. */
export function CommissionForm({
  electionId,
  personas,
  cargos,
}: {
  electionId: string;
  personas: readonly Option[];
  cargos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(assignCommissionAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="electionId" value={electionId} />
      <Aviso estado={estado} />

      <Select name="personId" label="Persona" required options={personas} errors={estado.fieldErrors?.['personId']} />
      <Select
        name="officeTermId"
        label="Cargo desde el que participa"
        options={cargos}
        placeholder="Ninguno"
        errors={estado.fieldErrors?.['officeTermId']}
      />
      <Checkbox
        name="noCandidacyDeclared"
        label="Declara no tener candidatura en este proceso"
        help="Sin esta declaración no se integra la comisión: quien valida planillas no puede presentarlas."
        errors={estado.fieldErrors?.['noCandidacyDeclared']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Integrando…' : 'Integrar a la comisión'}</SubmitButton>
    </form>
  );
}

/** Emisión de la convocatoria a elecciones. */
export function ElectionCallForm({ electionId, plantillas }: { electionId: string; plantillas: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(issueElectionCallAction, INICIAL);

  if (plantillas.length === 0) {
    return (
      <Notice tone="warning" title="No hay plantilla publicada de convocatoria">
        <p>Publica una plantilla de tipo «convocatoria» antes de convocar.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="electionId" value={electionId} />
      <Aviso estado={estado} />
      <Select
        name="templateCode"
        label="Plantilla de la convocatoria"
        required
        options={plantillas}
        errors={estado.fieldErrors?.['templateCode']}
      />
      <p className="text-sm text-[var(--color-ink-soft)]">
        Se comprueba que la comisión esté completa, que todas hayan declarado no tener candidatura y que la
        anticipación alcance el mínimo estatutario respecto de la jornada.
      </p>
      <SubmitButton>{pendiente ? 'Emitiendo…' : 'Emitir la convocatoria'}</SubmitButton>
    </form>
  );
}

/** Avance de etapa. */
export function AdvanceForm({ electionId, destinos }: { electionId: string; destinos: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(advanceElectionAction, INICIAL);

  if (destinos.length === 0) {
    return (
      <Notice tone="neutral" title="El proceso está terminado">
        <p>No admite más cambios de etapa.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="electionId" value={electionId} />
      <Aviso estado={estado} />
      <Select name="to" label="Pasar a" required options={destinos} errors={estado.fieldErrors?.['to']} />
      <TextArea name="reason" label="Motivo" required rows={2} errors={estado.fieldErrors?.['reason']} />
      <p className="text-sm text-[var(--color-ink-soft)]">
        El proceso no retrocede. Un proceso que se tuerce se anula, y la anulación consta con su motivo.
      </p>
      <SubmitButton variant="secondary">{pendiente ? 'Avanzando…' : 'Avanzar'}</SubmitButton>
    </form>
  );
}

/** Congelamiento y publicación del padrón electoral. */
export function RollForms({
  electionId,
  congelado,
  publicado,
}: {
  electionId: string;
  congelado: boolean;
  publicado: boolean;
}) {
  const [congelacion, accionCongelar, congelando] = useActionState(freezeElectionRosterAction, INICIAL);
  const [publicacion, accionPublicar, publicando] = useActionState(publishRollAction, INICIAL);

  return (
    <div className="space-y-4">
      {!congelado && (
        <form action={accionCongelar} className="space-y-2">
          <input type="hidden" name="electionId" value={electionId} />
          <Aviso estado={congelacion} />
          <p className="text-sm text-[var(--color-ink-soft)]">
            Congelar es irreversible. A partir de aquí el padrón electoral no cambia, y por eso puede publicarse e
            impugnarse.
          </p>
          <SubmitButton>{congelando ? 'Congelando…' : 'Congelar el padrón electoral'}</SubmitButton>
        </form>
      )}

      {congelado && !publicado && (
        <form action={accionPublicar} className="space-y-2">
          <input type="hidden" name="electionId" value={electionId} />
          <Aviso estado={publicacion} />
          <p className="text-sm text-[var(--color-ink-soft)]">
            Publicar abre el plazo de impugnación: quien no aparezca, o aparezca sin voto creyendo que le corresponde,
            plantea una incidencia de elegibilidad.
          </p>
          <SubmitButton>{publicando ? 'Publicando…' : 'Publicar el padrón electoral'}</SubmitButton>
        </form>
      )}
    </div>
  );
}

/** Registro de una planilla. */
export function SlateForm({
  electionId,
  personas,
  cargos,
}: {
  electionId: string;
  personas: readonly Option[];
  cargos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(registerSlateAction, INICIAL);

  if (cargos.length === 0) {
    return (
      <Notice tone="warning" title="El órgano no tiene cargos definidos">
        <p>Una planilla propone personas para cargos. Defínelos antes.</p>
      </Notice>
    );
  }

  const filas = Math.min(Math.max(cargos.length, 3), 15);

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="electionId" value={electionId} />
      <Aviso estado={estado} />

      <Field name="name" label="Nombre de la planilla" required errors={estado.fieldErrors?.['name']} />

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Candidaturas</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Deja en blanco las filas que no uses. Las advertencias —proporcionalidad, cargos sin cubrir, personas sin
          derechos políticos— se calculan al registrar y se conservan con la planilla.
        </p>
        {estado.fieldErrors?.['members'] !== undefined && (
          <ul className="space-y-1 text-sm text-[var(--color-danger)]">
            {estado.fieldErrors['members'].map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}
        {Array.from({ length: filas }, (_, indice) => (
          <div key={indice} className="grid gap-3 rounded-lg border border-[var(--color-line)] p-3 sm:grid-cols-3">
            <Select name="memberPersonId" label={`Persona ${indice + 1}`} options={personas} placeholder="Sin usar" />
            <Select name="memberOfficeId" label="Cargo" options={cargos} placeholder="Sin usar" />
            <label className="flex min-h-11 items-center gap-2 self-end text-sm">
              <input type="checkbox" name="memberSubstitute" value="si" className="size-4" />
              <span>Suplencia</span>
            </label>
          </div>
        ))}
      </fieldset>

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar la planilla'}</SubmitButton>
    </form>
  );
}

/** Validación o rechazo de una planilla. */
export function SlateDecisionForm({ slateId, name }: { slateId: string; name: string }) {
  const [estado, accion, pendiente] = useActionState(decideSlateAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="slateId" value={slateId} />
      <Aviso estado={estado} />

      <Select
        name="decision"
        label={`Resolución sobre «${name}»`}
        required
        options={[
          { value: 'VALIDATED', label: 'Validar' },
          { value: 'REJECTED', label: 'Rechazar' },
        ]}
        errors={estado.fieldErrors?.['decision']}
      />
      <TextArea
        name="rejectionReason"
        label="Motivo del rechazo"
        rows={2}
        hint="Obligatorio para rechazar: nadie queda fuera sin saber por qué."
        errors={estado.fieldErrors?.['rejectionReason']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Resolviendo…' : 'Resolver'}</SubmitButton>
    </form>
  );
}

/** Apertura de una incidencia. */
export function IncidentForm({ electionId }: { electionId: string }) {
  const [estado, accion, pendiente] = useActionState(openIncidentAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="electionId" value={electionId} />
      <Aviso estado={estado} />

      <Select
        name="kind"
        label="Tipo"
        required
        options={[
          { value: 'ELIGIBILITY', label: 'Elegibilidad — impugnación del padrón o de una candidatura' },
          { value: 'PROCEDURAL', label: 'Procedimiento' },
          { value: 'TECHNICAL', label: 'Técnica' },
          { value: 'CONDUCT', label: 'Conducta' },
          { value: 'CHALLENGE', label: 'Impugnación de resultados' },
        ]}
        errors={estado.fieldErrors?.['kind']}
      />
      <TextArea
        name="description"
        label="Descripción"
        required
        rows={4}
        errors={estado.fieldErrors?.['description']}
      />

      <div className="space-y-1.5">
        <label htmlFor={`incidencia-${electionId}`} className="block text-sm font-medium">
          Evidencia
        </label>
        <input id={`incidencia-${electionId}`} type="file" name="evidence" className="block w-full text-sm" />
      </div>

      <SubmitButton variant="secondary">{pendiente ? 'Registrando…' : 'Registrar la incidencia'}</SubmitButton>
    </form>
  );
}

/** Resolución de una incidencia. */
export function IncidentResolutionForm({ incidentId }: { incidentId: string }) {
  const [estado, accion, pendiente] = useActionState(resolveIncidentAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="incidentId" value={incidentId} />
      <Aviso estado={estado} />

      <Select
        name="status"
        label="Estado"
        required
        options={[
          { value: 'UNDER_REVIEW', label: 'En revisión' },
          { value: 'RESOLVED', label: 'Resuelta' },
          { value: 'DISMISSED', label: 'Desechada' },
          { value: 'ESCALATED', label: 'Turnada a otra instancia' },
        ]}
        errors={estado.fieldErrors?.['status']}
      />
      <TextArea
        name="resolution"
        label="Resolución"
        required
        rows={3}
        hint="Una incidencia cerrada sin motivo no se resolvió: se archivó."
        errors={estado.fieldErrors?.['resolution']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Guardando…' : 'Resolver'}</SubmitButton>
    </form>
  );
}

/** Programación de la jornada de votación. */
export function ElectionVoteForm({
  electionId,
  rosterSnapshotId,
  planillas,
}: {
  electionId: string;
  rosterSnapshotId: string;
  planillas: readonly { id: string; name: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(scheduleElectionVoteAction, INICIAL);

  if (planillas.length === 0) {
    return (
      <Notice tone="warning" title="No hay planillas validadas">
        <p>La papeleta se compone con las planillas que la Comisión Electoral validó. Sin ninguna, no hay qué votar.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="electionId" value={electionId} />
      <input type="hidden" name="rosterSnapshotId" value={rosterSnapshotId} />
      <Aviso estado={estado} />

      <Field name="title" label="Título de la jornada" required errors={estado.fieldErrors?.['title']} />
      <Field name="opensAt" label="Abre" type="datetime-local" required errors={estado.fieldErrors?.['opensAt']} />
      <Field name="closesAt" label="Cierra" type="datetime-local" required errors={estado.fieldErrors?.['closesAt']} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Papeleta</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Una opción por planilla validada. El voto es secreto: se emite con credencial y no queda vinculado a nadie.
        </p>
        <ul className="space-y-1 text-sm">
          {planillas.map((planilla, indice) => (
            <li key={planilla.id}>
              <input type="hidden" name="opcionCodigo" value={`PLANILLA_${indice + 1}`} />
              <input type="hidden" name="opcionEtiqueta" value={planilla.name} />
              {planilla.name}
            </li>
          ))}
        </ul>
      </fieldset>

      <SubmitButton>{pendiente ? 'Programando…' : 'Programar la jornada'}</SubmitButton>
    </form>
  );
}

/** Credenciales, cierre, escrutinio y certificación de la jornada. */
export function ElectionTallyForms({
  voteProcessId,
  status,
  plantillas,
}: {
  voteProcessId: string;
  status: string;
  plantillas: readonly Option[];
}) {
  const [credenciales, accionCredenciales, emitiendo] = useActionState(issueElectionCredentialsAction, INICIAL);
  const [cierre, accionCierre, cerrando] = useActionState(closeElectionVoteAction, INICIAL);
  const [escrutinio, accionEscrutinio, escrutando] = useActionState(tallyElectionVoteAction, INICIAL);
  const [certificacion, accionCertificacion, certificando] = useActionState(certifyElectionVoteAction, INICIAL);

  return (
    <div className="space-y-5">
      {status === 'SCHEDULED' && (
        <form action={accionCredenciales} className="space-y-3">
          <input type="hidden" name="voteProcessId" value={voteProcessId} />
          <Aviso estado={credenciales} />
          {credenciales.credentials !== undefined && credenciales.credentials.length > 0 && (
            <div className="space-y-2">
              <Notice tone="warning" title="Repártelas ahora">
                <p>El servidor no guarda estas credenciales ni su huella. Si cierras esta pantalla, no se recuperan.</p>
              </Notice>
              <ScrollableTable caption="Credenciales de voto emitidas">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left">
                    <th scope="col" className="p-2 font-medium">Persona</th>
                    <th scope="col" className="p-2 font-medium">Número</th>
                    <th scope="col" className="p-2 font-medium">Credencial</th>
                    <th scope="col" className="p-2 font-medium">Acuse</th>
                  </tr>
                </thead>
                <tbody>
                  {credenciales.credentials.map((credencial) => (
                    <tr key={credencial.membershipId} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="p-2">{credencial.personName}</td>
                      <td className="p-2 font-mono text-xs">{credencial.memberNumber}</td>
                      <td className="p-2 font-mono text-xs break-all">{credencial.credential}</td>
                      <td className="p-2 font-mono text-xs">{credencial.receiptCode}</td>
                    </tr>
                  ))}
                </tbody>
              </ScrollableTable>
            </div>
          )}
          <SubmitButton>{emitiendo ? 'Emitiendo…' : 'Emitir credenciales y abrir la jornada'}</SubmitButton>
        </form>
      )}

      {status === 'OPEN' && (
        <form action={accionCierre} className="space-y-2">
          <input type="hidden" name="voteProcessId" value={voteProcessId} />
          <Aviso estado={cierre} />
          <SubmitButton variant="secondary">{cerrando ? 'Cerrando…' : 'Cerrar la jornada'}</SubmitButton>
        </form>
      )}

      {status === 'CLOSED' && (
        <form action={accionEscrutinio} className="space-y-2">
          <input type="hidden" name="voteProcessId" value={voteProcessId} />
          <Aviso estado={escrutinio} />
          <SubmitButton>{escrutando ? 'Escrutando…' : 'Escrutar'}</SubmitButton>
        </form>
      )}

      {status === 'TALLIED' && (
        <form action={accionCertificacion} className="space-y-3">
          <input type="hidden" name="voteProcessId" value={voteProcessId} />
          <Aviso estado={certificacion} />
          {plantillas.length === 0 ? (
            <Notice tone="warning" title="No hay plantilla publicada de acta de resultados">
              <p>Publica una antes de certificar.</p>
            </Notice>
          ) : (
            <>
              <Select
                name="templateCode"
                label="Plantilla del acta de resultados"
                required
                options={plantillas}
                errors={certificacion.fieldErrors?.['templateCode']}
              />
              <p className="text-sm text-[var(--color-ink-soft)]">
                Certificar destruye la clave del proceso: nadie podrá fabricar credenciales para esta jornada.
              </p>
              <SubmitButton>{certificando ? 'Certificando…' : 'Certificar los resultados'}</SubmitButton>
            </>
          )}
        </form>
      )}
    </div>
  );
}

/** Exportación del expediente para la autoridad laboral. */
export function EvidenceExportForm({ electionId }: { electionId: string }) {
  const [estado, accion, pendiente] = useActionState(exportEvidenceAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="electionId" value={electionId} />
      <Aviso estado={estado} />

      <TextArea
        name="reason"
        label="Motivo de la exportación"
        required
        rows={2}
        hint="Queda en la bitácora: exportar un expediente electoral es un acto con destinatario."
        errors={estado.fieldErrors?.['reason']}
      />

      {estado.evidence !== undefined && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Expediente</p>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Cópialo tal cual. Su huella se calcula sobre este contenido sin la última línea, de modo que quien lo
            reciba pueda comprobarlo por su cuenta.
          </p>
          <pre className="max-h-96 overflow-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-3 text-xs">
            {estado.evidence}
          </pre>
        </div>
      )}

      <SubmitButton variant="secondary">{pendiente ? 'Reuniendo…' : 'Reunir el expediente'}</SubmitButton>
    </form>
  );
}
