'use client';

import { useActionState } from 'react';
import {
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
  certifyVoteAction,
  closeVoteAction,
  declareQuorumAction,
  freezeRosterAction,
  issueCredentialsAction,
  publishMinutesAction,
  recordResolutionAction,
  registerAttendanceAction,
  scheduleVoteAction,
  tallyVoteAction,
  updateFollowUpAction,
  type SessionFormState,
} from './session-actions';

const INICIAL: SessionFormState = { status: 'idle' };

const PUBLICACION: readonly Option[] = [
  { value: 'RESERVED', label: 'Reservada — solo el órgano y quien tenga facultad' },
  { value: 'MEMBERS_ONLY', label: 'Para agremiados' },
  { value: 'PUBLIC_REDACTED', label: 'Pública en versión pertinente' },
];

function Aviso({ estado }: { estado: SessionFormState }) {
  return (
    <>
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo completar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
    </>
  );
}

/** Congelamiento del padrón. Acto irreversible. */
export function FreezeRosterForm({
  assemblyId,
  total,
  withVote,
}: {
  assemblyId: string;
  total: number;
  withVote: number;
}) {
  const [estado, accion, pendiente] = useActionState(freezeRosterAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="assemblyId" value={assemblyId} />
      <Aviso estado={estado} />
      <p className="text-sm">
        Se congelarán <strong className="tabular-nums">{total}</strong> membresías, de las cuales{' '}
        <strong className="tabular-nums">{withVote}</strong> con derecho a voto.
      </p>
      <p className="text-sm text-[var(--color-ink-soft)]">
        No se deshace. A partir de aquí, el quórum y el voto se cuentan sobre este padrón y no sobre el de mañana.
      </p>
      <SubmitButton>{pendiente ? 'Congelando…' : 'Congelar el padrón'}</SubmitButton>
    </form>
  );
}

/** Registro de asistencia. */
export function AttendanceForm({ assemblyId, elegibles }: { assemblyId: string; elegibles: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(registerAttendanceAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="assemblyId" value={assemblyId} />
      <Aviso estado={estado} />

      <Field
        name="credentialToken"
        label="Credencial leída"
        hint="Pega aquí el contenido del código QR de la credencial. Si registras a mano, déjalo en blanco."
        errors={estado.fieldErrors?.['credentialToken']}
      />
      <Select
        name="membershipId"
        label="O elige a la persona"
        options={elegibles}
        placeholder="Sin elegir"
        hint="Solo aparecen las personas del padrón congelado."
        errors={estado.fieldErrors?.['membershipId']}
      />
      <Select
        name="method"
        label="Forma de registro"
        required
        options={[
          { value: 'QR_CREDENTIAL', label: 'Lectura de credencial' },
          { value: 'MANUAL', label: 'Manual, tras comprobar identidad' },
          { value: 'REMOTE_SESSION', label: 'Sesión a distancia' },
        ]}
        errors={estado.fieldErrors?.['method']}
      />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar asistencia'}</SubmitButton>
    </form>
  );
}

/** Declaración de quórum. */
export function DeclareQuorumForm({
  assemblyId,
  ordinal,
  present,
  required,
  base,
  rosterIntact,
}: {
  assemblyId: string;
  ordinal: 'FIRST' | 'SECOND';
  present: number;
  required: number | null;
  base: number;
  rosterIntact: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(declareQuorumAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="assemblyId" value={assemblyId} />
      <input type="hidden" name="ordinal" value={ordinal} />
      <Aviso estado={estado} />

      <p className="text-sm">
        Presentes <strong className="tabular-nums">{present}</strong> de{' '}
        <strong className="tabular-nums">{base}</strong> en el padrón
        {required === null ? ' · la regla son los presentes' : ` · hacen falta ${required}`}.
      </p>

      {rosterIntact ? (
        <>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Quien declara el quórum responde por él: su nombre queda en el acta.
          </p>
          <SubmitButton>
            {pendiente
              ? 'Declarando…'
              : `Declarar quórum con la ${ordinal === 'FIRST' ? 'primera' : 'segunda'} convocatoria`}
          </SubmitButton>
        </>
      ) : (
        <ErrorNotice title="La huella del padrón no corresponde con sus entradas">
          <p>
            No se declara quórum sobre un padrón que no se puede comprobar. El botón no está aquí porque el acto no
            se puede hacer, no porque esté deshabilitado.
          </p>
        </ErrorNotice>
      )}
    </form>
  );
}

/** Programación de una votación sobre un punto. */
export function ScheduleVoteForm({
  assemblyId,
  rosterSnapshotId,
  puntos,
}: {
  assemblyId: string;
  rosterSnapshotId: string;
  puntos: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(scheduleVoteAction, INICIAL);

  if (puntos.length === 0) {
    return (
      <Notice tone="neutral" title="No hay puntos pendientes de votar">
        <p>Todos los puntos del orden del día ya se resolvieron o son informativos.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="assemblyId" value={assemblyId} />
      <input type="hidden" name="rosterSnapshotId" value={rosterSnapshotId} />
      <Aviso estado={estado} />

      <Select name="agendaItemId" label="Punto" required options={puntos} errors={estado.fieldErrors?.['agendaItemId']} />
      <Field name="title" label="Título de la votación" required errors={estado.fieldErrors?.['title']} />
      <Select
        name="method"
        label="Modalidad"
        required
        options={[
          { value: 'SECRET', label: 'Secreta — con credencial, sin vínculo con la persona' },
          { value: 'OPEN_ROLL_CALL', label: 'Nominal — a mano alzada o por lista' },
        ]}
        errors={estado.fieldErrors?.['method']}
      />
      <Field name="opensAt" label="Abre" type="datetime-local" required errors={estado.fieldErrors?.['opensAt']} />
      <Field name="closesAt" label="Cierra" type="datetime-local" required errors={estado.fieldErrors?.['closesAt']} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Etiquetas de la papeleta</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Las tres opciones de un acuerdo son siempre las mismas. Aquí solo cambia cómo se nombran.
        </p>
        <Field name="optionLabels" label="A favor" defaultValue="A favor" />
        <Field name="optionLabels" label="En contra" defaultValue="En contra" />
        <Field name="optionLabels" label="Abstención" defaultValue="Abstención" />
      </fieldset>

      <SubmitButton>{pendiente ? 'Programando…' : 'Programar la votación'}</SubmitButton>
    </form>
  );
}

/**
 * Emisión de credenciales.
 *
 * La respuesta trae los valores una sola vez. La pantalla los enseña en una
 * tabla para imprimir o copiar, y avisa de que no volverán a mostrarse: el
 * servidor no los guarda (ADR-0012).
 */
export function IssueCredentialsForm({ voteProcessId }: { voteProcessId: string }) {
  const [estado, accion, pendiente] = useActionState(issueCredentialsAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="voteProcessId" value={voteProcessId} />
      <Aviso estado={estado} />

      {estado.credentials !== undefined && estado.credentials.length > 0 && (
        <div className="space-y-2">
          <Notice tone="warning" title="Repártelas ahora">
            <p>
              El servidor no guarda estas credenciales ni su huella. Si cierras esta pantalla sin copiarlas, no hay
              forma de recuperarlas: habría que anular la votación y repetirla.
            </p>
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
              {estado.credentials.map((credencial) => (
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

      <p className="text-sm text-[var(--color-ink-soft)]">
        Emitir las credenciales abre la votación. Se emiten una sola vez.
      </p>
      <SubmitButton>{pendiente ? 'Emitiendo…' : 'Emitir credenciales y abrir la votación'}</SubmitButton>
    </form>
  );
}

/** Cierre, escrutinio y certificación. */
export function TallyForms({
  voteProcessId,
  status,
  plantillas,
}: {
  voteProcessId: string;
  status: string;
  plantillas: readonly Option[];
}) {
  const [cierre, accionCierre, cerrando] = useActionState(closeVoteAction, INICIAL);
  const [escrutinio, accionEscrutinio, escrutando] = useActionState(tallyVoteAction, INICIAL);
  const [certificacion, accionCertificacion, certificando] = useActionState(certifyVoteAction, INICIAL);

  return (
    <div className="space-y-5">
      {status === 'OPEN' && (
        <form action={accionCierre} className="space-y-2">
          <input type="hidden" name="voteProcessId" value={voteProcessId} />
          <Aviso estado={cierre} />
          <SubmitButton variant="secondary">{cerrando ? 'Cerrando…' : 'Cerrar la votación'}</SubmitButton>
        </form>
      )}

      {status === 'CLOSED' && (
        <form action={accionEscrutinio} className="space-y-2">
          <input type="hidden" name="voteProcessId" value={voteProcessId} />
          <Aviso estado={escrutinio} />
          {escrutinio.verificationCodes !== undefined && escrutinio.verificationCodes.length > 0 && (
            <div>
              <p className="text-sm font-medium">Códigos de verificación escrutados</p>
              <p className="text-xs text-[var(--color-ink-soft)]">
                Quien depositó comprueba aquí que su boleta se contó. La lista no dice el sentido de ninguna.
              </p>
              <p className="mt-1 font-mono text-xs break-all">{escrutinio.verificationCodes.join(' · ')}</p>
            </div>
          )}
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
                Certificar destruye la clave del proceso: nadie podrá fabricar credenciales para esta votación,
                tampoco quien conserve el secreto del entorno.
              </p>
              <SubmitButton>{certificando ? 'Certificando…' : 'Certificar los resultados'}</SubmitButton>
            </>
          )}
        </form>
      )}
    </div>
  );
}

/** Asiento de una resolución. */
export function RecordResolutionForm({
  puntos,
  votaciones,
  responsables,
}: {
  puntos: readonly Option[];
  votaciones: readonly Option[];
  responsables: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(recordResolutionAction, INICIAL);

  if (puntos.length === 0) {
    return (
      <Notice tone="neutral" title="No quedan puntos por resolver">
        <p>Todos los puntos del orden del día tienen resolución asentada.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <Aviso estado={estado} />

      <Select name="agendaItemId" label="Punto" required options={puntos} errors={estado.fieldErrors?.['agendaItemId']} />
      <Select
        name="voteProcessId"
        label="Votación que la respalda"
        options={votaciones}
        placeholder="Ninguna: es un punto informativo"
        hint="Obligatoria salvo en puntos informativos y de informe financiero. El resultado se lee del escrutinio."
        errors={estado.fieldErrors?.['voteProcessId']}
      />
      <TextArea name="text" label="Texto del acuerdo" required rows={5} errors={estado.fieldErrors?.['text']} />
      <Field
        name="effectiveFrom"
        label="Entra en vigor el"
        type="date"
        errors={estado.fieldErrors?.['effectiveFrom']}
      />
      <Select
        name="publicationLevel"
        label="Nivel de publicación"
        required
        options={PUBLICACION}
        errors={estado.fieldErrors?.['publicationLevel']}
      />
      <Select
        name="followUpOwnerId"
        label="Responsable del seguimiento"
        options={responsables}
        placeholder="Ninguno: el acuerdo no exige seguimiento"
        errors={estado.fieldErrors?.['followUpOwnerId']}
      />
      <Field name="followUpDueOn" label="Plazo" type="date" errors={estado.fieldErrors?.['followUpDueOn']} />

      <SubmitButton>{pendiente ? 'Asentando…' : 'Asentar la resolución'}</SubmitButton>
    </form>
  );
}

/** Publicación del acta. */
export function PublishMinutesForm({
  assemblyId,
  plantillas,
}: {
  assemblyId: string;
  plantillas: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(publishMinutesAction, INICIAL);

  if (plantillas.length === 0) {
    return (
      <Notice tone="warning" title="No hay plantilla publicada de acta">
        <p>Publica una plantilla de tipo «acta de asamblea» antes de cerrar la sesión.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="assemblyId" value={assemblyId} />
      <Aviso estado={estado} />

      <TextArea
        name="narrative"
        label="Relato de la sesión"
        required
        rows={10}
        hint="Lo que ocurrió: intervenciones, incidencias y desarrollo. El quórum, la asistencia y las resoluciones se añaden solos."
        errors={estado.fieldErrors?.['narrative']}
      />
      <Select
        name="publicationLevel"
        label="Nivel de publicación del acta"
        required
        options={PUBLICACION}
        errors={estado.fieldErrors?.['publicationLevel']}
      />
      <Select
        name="templateCode"
        label="Plantilla del acta"
        required
        options={plantillas}
        errors={estado.fieldErrors?.['templateCode']}
      />

      <SubmitButton>{pendiente ? 'Publicando…' : 'Cerrar la sesión y publicar el acta'}</SubmitButton>
    </form>
  );
}

/** Seguimiento de un acuerdo. La evidencia se adjunta en el mismo acto. */
export function FollowUpForm({ resolutionId }: { resolutionId: string }) {
  const [estado, accion, pendiente] = useActionState(updateFollowUpAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="resolutionId" value={resolutionId} />
      <Aviso estado={estado} />

      <Select
        name="status"
        label="Estado"
        required
        options={[
          { value: 'PENDING', label: 'Pendiente' },
          { value: 'IN_PROGRESS', label: 'En curso' },
          { value: 'COMPLETED', label: 'Cumplido' },
          { value: 'OVERDUE', label: 'Vencido' },
        ]}
        errors={estado.fieldErrors?.['status']}
      />

      <div className="space-y-1.5">
        <label htmlFor={`evidencia-${resolutionId}`} className="block text-sm font-medium">
          Documento que acredita el cumplimiento
        </label>
        <p id={`evidencia-ayuda-${resolutionId}`} className="text-sm text-[var(--color-ink-soft)]">
          Obligatorio para dar por cumplido un acuerdo. Sin él, «cumplido» sería la palabra de quien lleva el
          seguimiento sobre su propio trabajo.
        </p>
        <input
          id={`evidencia-${resolutionId}`}
          type="file"
          name="evidence"
          aria-describedby={`evidencia-ayuda-${resolutionId}`}
          className="block w-full text-sm"
        />
        {estado.fieldErrors?.['evidence'] !== undefined && (
          <ul className="space-y-1 text-sm text-[var(--color-danger)]">
            {estado.fieldErrors['evidence'].map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}
      </div>

      <TextArea name="note" label="Nota" required rows={2} errors={estado.fieldErrors?.['note']} />

      <SubmitButton variant="secondary">{pendiente ? 'Guardando…' : 'Actualizar el seguimiento'}</SubmitButton>
    </form>
  );
}
