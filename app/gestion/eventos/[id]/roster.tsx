'use client';

import { useActionState } from 'react';
import { Badge, Select, SubmitButton } from '@/design-system/primitives';
import type { RosterRow } from '@/modules/events';
import {
  issueConstancyAction,
  registerAttendanceAction,
  revokeConstancyAction,
  type RosterState,
} from '../actions';
import { ESTADO_DE_INSCRIPCION } from '../etiquetas';

const INICIAL: RosterState = { status: 'idle' };

const PARTICIPA = new Set(['REGISTERED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW']);

/**
 * El padrón del evento con sus acciones: asistencia, evaluación y constancia.
 *
 * Cada persona es una fila con formularios propios; cada formulario tiene su
 * propio estado, para que el mensaje de uno no confunda al de otra. Todo
 * funciona sin JavaScript: son formularios que recargan el detalle.
 */
export function Roster({
  eventId,
  issuesConstancy,
  rows,
}: {
  eventId: string;
  issuesConstancy: boolean;
  rows: readonly RosterRow[];
}) {
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <RosterFila key={r.registrationId} eventId={eventId} issuesConstancy={issuesConstancy} row={r} />
      ))}
    </div>
  );
}

function RosterFila({
  eventId,
  issuesConstancy,
  row,
}: {
  eventId: string;
  issuesConstancy: boolean;
  row: RosterRow;
}) {
  const [asistencia, guardarAsistencia] = useActionState(registerAttendanceAction, INICIAL);
  const [emision, emitir] = useActionState(issueConstancyAction, INICIAL);
  const [revocacion, revocar] = useActionState(revokeConstancyAction, INICIAL);

  const est = ESTADO_DE_INSCRIPCION[row.status];
  const puedeAsistencia = PARTICIPA.has(row.status);

  return (
    <div className="rounded-lg border border-[var(--color-line)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{row.personName}</span>
        <Badge tone={est.tone}>{est.label}</Badge>
      </div>

      {puedeAsistencia && (
        <form action={guardarAsistencia} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="registrationId" value={row.registrationId} />
          <div className="w-44">
            <Select
              name="attended"
              label="Asistencia"
              defaultValue={row.attended ? 'true' : 'false'}
              placeholder="Elige"
              options={[
                { value: 'true', label: 'Asistió' },
                { value: 'false', label: 'No asistió' },
              ]}
            />
          </div>
          <div className="w-32">
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium">Evaluación</span>
              <input
                type="number"
                name="evaluationScore"
                min={0}
                max={100}
                defaultValue={row.evaluationScore ?? ''}
                className="min-h-11 w-full rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3"
              />
            </label>
          </div>
          <SubmitButton variant="secondary">Guardar</SubmitButton>
          {asistencia.status === 'error' && (
            <p role="alert" className="w-full text-sm text-[var(--color-danger)]">{asistencia.message}</p>
          )}
          {asistencia.status === 'ok' && (
            <p role="status" className="w-full text-sm text-[var(--color-ink-soft)]">{asistencia.message}</p>
          )}
        </form>
      )}

      {issuesConstancy && (
        <div className="mt-3 border-t border-[var(--color-line)] pt-3">
          {row.constancyPublicId === null ? (
            <form action={emitir} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="registrationId" value={row.registrationId} />
              <SubmitButton variant="secondary">Emitir constancia</SubmitButton>
              {emision.status === 'error' && (
                <p role="alert" className="text-sm text-[var(--color-danger)]">{emision.message}</p>
              )}
            </form>
          ) : row.constancyRevoked ? (
            <p className="text-sm text-[var(--color-ink-soft)]">
              Constancia <span className="font-mono">{row.constancyPublicId}</span> · revocada.
            </p>
          ) : (
            <form action={revocar} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="registrationId" value={row.registrationId} />
              <span className="text-sm">
                Constancia <span className="font-mono">{row.constancyPublicId}</span> · vigente.
              </span>
              <div className="min-w-56 flex-1">
                <label className="block space-y-1.5">
                  <span className="block text-sm font-medium">Motivo de la revocación</span>
                  <input
                    type="text"
                    name="reason"
                    required
                    maxLength={400}
                    className="min-h-11 w-full rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3"
                  />
                </label>
              </div>
              <SubmitButton variant="danger">Revocar</SubmitButton>
              {revocacion.status === 'error' && (
                <p role="alert" className="w-full text-sm text-[var(--color-danger)]">{revocacion.message}</p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
