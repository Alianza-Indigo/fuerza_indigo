import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  PageShell,
  ScrollableTable,
  type Option,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { assemblyList } from '@/modules/assembly';
import { officeTermList, unionBodyList } from '@/modules/governance';
import { territoryOptions } from '@/modules/access';
import { ConveneForm } from './assembly-forms';

export const metadata = { title: 'Asambleas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  PLANNED: { label: 'Planeada', tone: 'neutral' },
  CALLED: { label: 'Convocada', tone: 'accent' },
  SECOND_CALL: { label: 'Segunda convocatoria', tone: 'warning' },
  IN_SESSION: { label: 'En sesión', tone: 'success' },
  CLOSED: { label: 'Cerrada', tone: 'neutral' },
  PUBLISHED: { label: 'Acta publicada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'danger' },
};

const TIPO: Record<string, string> = {
  ORDINARY: 'Ordinaria',
  EXTRAORDINARY: 'Extraordinaria',
  SECTIONAL: 'Seccional',
};

/**
 * Asambleas (PRD §9.4; F5-ASA-001).
 *
 * La lista enseña, para cada sesión, las dos cosas que deciden si puede
 * celebrarse: qué convocatorias salieron y si el padrón está congelado.
 */
export default async function AsambleasPage() {
  const actor = await currentActor();

  const [asambleas, organos, territorios, cargos] = await Promise.all([
    assemblyList(actor),
    unionBodyList(actor),
    territoryOptions(actor),
    officeTermList(actor, { onlyLive: true }),
  ]);

  const puedeConvocar = can({ ...actor, reason: 'convocatoria de asamblea' }, 'assembly.assembly.convene', {
    kind: 'Assembly',
  }).allowed;

  const fechaHora = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  const opcionesOrgano: readonly Option[] = organos.ok
    ? organos.data.filter((organo) => organo.status === 'ACTIVE').map((organo) => ({ value: organo.id, label: organo.name }))
    : [];
  const opcionesTerritorio: readonly Option[] = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];
  const opcionesCargo: readonly Option[] = cargos.ok
    ? cargos.data.map((cargo) => ({ value: cargo.id, label: `${cargo.officeName} · ${cargo.personName}` }))
    : [];

  return (
    <PageShell
      title="Asambleas"
      description="Cada sesión guarda la versión de reglas con la que se convocó. La anticipación estatutaria se comprueba al emitir la convocatoria, no el día de la sesión."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Sesiones</h2>
          {!asambleas.ok ? (
            <ErrorNotice title={asambleas.error.message} />
          ) : asambleas.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna asamblea"
              description="Regístrala, añade el orden del día y emite la convocatoria."
            />
          ) : (
            <ScrollableTable caption="Asambleas de la más reciente a la más antigua">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Sesión</th>
                  <th scope="col" className="p-3 font-medium">Cuándo</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Convocatorias</th>
                  <th scope="col" className="p-3 font-medium">Padrón</th>
                  <th scope="col" className="p-3 font-medium">
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {asambleas.data.map((asamblea) => {
                  const estado = ESTADO[asamblea.status] ?? { label: asamblea.status, tone: 'neutral' as Tone };
                  return (
                    <tr key={asamblea.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                      <td className="p-3">
                        <span className="font-medium">{TIPO[asamblea.type] ?? asamblea.type}</span>
                        <span className="block text-xs text-[var(--color-ink-soft)]">
                          {asamblea.bodyName} · {asamblea.territory}
                        </span>
                        <span className="block font-mono text-xs text-[var(--color-ink-soft)]">
                          {asamblea.publicId}
                        </span>
                      </td>
                      <td className="p-3 tabular-nums">{fechaHora.format(asamblea.scheduledAt)}</td>
                      <td className="p-3">
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                        {asamblea.convenedByPetition && (
                          <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">Por petición</span>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        {asamblea.calls.length === 0 ? (
                          <span className="text-[var(--color-ink-soft)]">Sin emitir</span>
                        ) : (
                          asamblea.calls.map((call) => (
                            <span key={call.ordinal} className="block">
                              {call.ordinal === 'FIRST' ? 'Primera' : 'Segunda'} · {call.noticeDays} días
                            </span>
                          ))
                        )}
                      </td>
                      <td className="p-3">
                        {asamblea.rosterFrozen ? (
                          <Badge tone="success">Congelado</Badge>
                        ) : (
                          <Badge tone="warning">Sin congelar</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/institucional/asambleas/${asamblea.publicId}`}
                          className="inline-flex min-h-11 items-center underline underline-offset-4"
                        >
                          Abrir<span className="sr-only"> la sesión {asamblea.publicId}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        {puedeConvocar && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Registrar una asamblea</h2>
            <Card>
              <ConveneForm organos={opcionesOrgano} territorios={opcionesTerritorio} cargos={opcionesCargo} />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
