import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  Notice,
  PageShell,
  ScrollableTable,
  Section,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { applicationDetail } from '@/modules/membership';
import {
  ACCION_DE_REVISION,
  ESTADO_DE_DOCUMENTO,
  ESTADO_DE_SOLICITUD,
  FORMA_DE_TRABAJO,
  OTRO_SINDICATO,
  PERFIL_HONORARIO,
  TIPO_DE_DOCUMENTO,
} from '../etiquetas';
import { DocumentForm } from './document-form';
import { WithdrawForm } from './withdraw-form';

export const metadata = { title: 'Mi solicitud', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ADMITEN_DOCUMENTOS = ['DRAFT', 'SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED'];
const RETIRABLES = ADMITEN_DOCUMENTOS;

/**
 * Detalle de la solicitud propia (PRD §8.1).
 *
 * Enseña lo que se envió, lo que la organización ha ido anotando y qué toca
 * hacer ahora. Un trámite en el que no se sabe en qué punto está es un trámite
 * que la gente abandona.
 */
export default async function MiSolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const detalle = await applicationDetail(actor, { applicationId: id });
  if (!detalle.ok) {
    if (detalle.error.code === 'NOT_FOUND') notFound();
    return (
      <PageShell title="Mi solicitud">
        <ErrorNotice title={detalle.error.message} />
      </PageShell>
    );
  }

  const solicitud = detalle.data;
  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const fechaHora = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  const rechazados = solicitud.documentList.filter((documento) => documento.status === 'REJECTED');

  return (
    <PageShell title={`Solicitud ${solicitud.folio}`} description={solicitud.membershipType}>
      <div className="space-y-8">
        <p>
          <Link href="/mi/afiliacion" className="underline underline-offset-4">
            ← Volver a mi afiliación
          </Link>
        </p>

        <Section title="En qué punto está">
          <p className="text-lg">
            <Badge tone={solicitud.status === 'REJECTED' ? 'danger' : 'accent'}>
              {ESTADO_DE_SOLICITUD[solicitud.status] ?? solicitud.status}
            </Badge>
          </p>
          {solicitud.submittedAt !== null && (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Enviada el {fechaHora.format(solicitud.submittedAt)} · estatuto aceptado{' '}
              {solicitud.acceptedRuleSetVersion}
            </p>
          )}

          {solicitud.status === 'CLARIFICATION_REQUIRED' && (
            <Notice tone="warning" title="Te pedimos una aclaración">
              <p>
                Lee la última anotación de abajo y responde adjuntando lo que se te pide.
                {solicitud.clarificationDueAt !== null &&
                  ` Tienes hasta el ${fecha.format(solicitud.clarificationDueAt)}.`}
              </p>
            </Notice>
          )}

          {rechazados.length > 0 && (
            <Notice tone="warning" title={`Hay ${rechazados.length} documento(s) por corregir`}>
              <ul className="list-disc pl-5">
                {rechazados.map((documento) => (
                  <li key={documento.id}>
                    {TIPO_DE_DOCUMENTO[documento.kind] ?? documento.kind}: {documento.reviewNote}
                  </li>
                ))}
              </ul>
            </Notice>
          )}

          {solicitud.status === 'REJECTED' && solicitud.resolutionReason !== null && (
            <Notice tone="danger" title="Tu solicitud fue rechazada">
              <p>{solicitud.resolutionReason}</p>
            </Notice>
          )}
        </Section>

        <Section title="Lo que enviaste" description="Tal como lo enviaste. Nadie puede modificarlo.">
          <dl className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
            {solicitud.category === 'UNION_MEMBER' ? (
              <>
                <div className="p-4">
                  <dt className="font-medium">A qué te dedicas</dt>
                  <dd className="mt-1 text-[var(--color-ink-soft)]">
                    {solicitud.occupation ?? '—'}
                    {solicitud.workRelationKind !== null &&
                      ` · ${FORMA_DE_TRABAJO[solicitud.workRelationKind] ?? solicitud.workRelationKind}`}
                  </dd>
                </div>
                <div className="p-4">
                  <dt className="font-medium">Tu contacto con personas neurodivergentes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-[var(--color-ink-soft)]">
                    {solicitud.neurodivergentContactStatement ?? '—'}
                  </dd>
                </div>
                <div className="p-4">
                  <dt className="font-medium">Otro sindicato</dt>
                  <dd className="mt-1 text-[var(--color-ink-soft)]">
                    {solicitud.otherUnionMembership === null
                      ? '—'
                      : (OTRO_SINDICATO[solicitud.otherUnionMembership] ?? solicitud.otherUnionMembership)}
                    {solicitud.otherUnionClarification !== null && (
                      <span className="mt-1 block whitespace-pre-wrap">{solicitud.otherUnionClarification}</span>
                    )}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div className="p-4">
                  <dt className="font-medium">Perfil</dt>
                  <dd className="mt-1 text-[var(--color-ink-soft)]">
                    {solicitud.honoraryProfile === null
                      ? '—'
                      : (PERFIL_HONORARIO[solicitud.honoraryProfile] ?? solicitud.honoraryProfile)}
                  </dd>
                </div>
                {solicitud.neurodivergentContactStatement !== null && (
                  <div className="p-4">
                    <dt className="font-medium">Lo que nos contaste</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-[var(--color-ink-soft)]">
                      {solicitud.neurodivergentContactStatement}
                    </dd>
                  </div>
                )}
              </>
            )}
            <div className="p-4">
              <dt className="font-medium">Territorio</dt>
              <dd className="mt-1 text-[var(--color-ink-soft)]">{solicitud.territory ?? 'Sin especificar'}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Tus documentos">
          {solicitud.documentList.length === 0 ? (
            <EmptyState title="Sin documentos" description="Adjunta lo que te pidan con el formulario de abajo." />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Documento</th>
                  <th scope="col" className="p-3 font-medium">Archivo</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody>
                {solicitud.documentList.map((documento) => (
                  <tr key={documento.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">{TIPO_DE_DOCUMENTO[documento.kind] ?? documento.kind}</td>
                    <td className="p-3 text-sm">
                      <Link
                        href={`/api/v1/files/${documento.fileObjectId}/pase`}
                        className="underline underline-offset-4"
                      >
                        {documento.fileName}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Badge tone={documento.status === 'REJECTED' ? 'danger' : documento.status === 'ACCEPTED' ? 'success' : 'neutral'}>
                        {ESTADO_DE_DOCUMENTO[documento.status] ?? documento.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm">{documento.reviewNote ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}

          {ADMITEN_DOCUMENTOS.includes(solicitud.status) && (
            <Card>
              <h3 className="mb-3 font-semibold">Adjuntar un documento</h3>
              <DocumentForm applicationId={solicitud.id} />
            </Card>
          )}
        </Section>

        <Section title="Lo que ha ido pasando">
          {solicitud.reviews.length === 0 ? (
            <EmptyState
              title="Todavía no hay anotaciones"
              description="Cuando alguien revise tu solicitud aparecerá aquí, con su nombre y su fecha."
            />
          ) : (
            <ol className="space-y-3">
              {solicitud.reviews.map((revision) => (
                <li key={revision.id} className="rounded-lg border border-[var(--color-line)] p-4">
                  <p className="font-medium">{ACCION_DE_REVISION[revision.action] ?? revision.action}</p>
                  <p className="mt-1 whitespace-pre-wrap">{revision.rationale}</p>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    {revision.reviewer} · {fechaHora.format(revision.createdAt)}
                    {revision.dueAt !== null && ` · plazo hasta ${fecha.format(revision.dueAt)}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {RETIRABLES.includes(solicitud.status) && (
          <Section title="Retirar la solicitud" description="Puedes volver a solicitar después.">
            <Card>
              <WithdrawForm applicationId={solicitud.id} />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
