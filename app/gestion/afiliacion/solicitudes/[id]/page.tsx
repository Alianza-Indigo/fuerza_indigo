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
import { applicationDetail, specialtyOptions } from '@/modules/membership';
import { territoryOptions } from '@/modules/access';
import { can } from '@/platform/authz/policy';
import {
  ACCION_DE_REVISION,
  ESTADO_DE_DOCUMENTO,
  ESTADO_DE_SOLICITUD,
  FORMA_DE_TRABAJO,
  OTRO_SINDICATO,
  PERFIL_HONORARIO,
  TIPO_DE_DOCUMENTO,
} from '../../../../(portal)/mi/afiliacion/etiquetas';
import { AssistedForm } from './assisted-form';
import { DocumentReviewForm } from './document-review-form';

export const metadata = { title: 'Solicitud de afiliación', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Expediente de una solicitud para quien la revisa (PRD §8.1, pasos 9 y 10).
 *
 * Muestra el resumen inmutable —lo que la persona envió, tal como lo envió— y
 * los documentos con su revisión individual. Las actuaciones de revisión y la
 * resolución llegan con el bloque de revisión; aquí ya se ven las que existan,
 * porque un expediente que esconde su historial no es un expediente.
 */
export default async function SolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const detalle = await applicationDetail(actor, { applicationId: id });
  if (!detalle.ok) {
    if (detalle.error.code === 'NOT_FOUND') notFound();
    return (
      <PageShell title="Solicitud de afiliación">
        <ErrorNotice title={detalle.error.message} />
      </PageShell>
    );
  }

  const solicitud = detalle.data;
  const puedeRevisar = can(actor, 'membership.application.review', {
    kind: 'MembershipApplication',
    id: solicitud.id,
  }).allowed;

  const esBorrador = solicitud.status === 'DRAFT';
  const [especialidades, territorios] = esBorrador
    ? await Promise.all([specialtyOptions(actor), territoryOptions(actor)])
    : [null, null];

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const fechaHora = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  const borrador =
    solicitud.autosavedDraft !== null && typeof solicitud.autosavedDraft === 'object'
      ? (solicitud.autosavedDraft as Record<string, string>)
      : {};

  return (
    <PageShell
      title={`Solicitud ${solicitud.folio}`}
      description={`${solicitud.personName} · ${solicitud.membershipType}`}
    >
      <div className="space-y-8">
        <p>
          <Link href="/gestion/afiliacion/solicitudes" className="underline underline-offset-4">
            ← Volver a la cola
          </Link>
          {' · '}
          <Link href={`/gestion/registro/${solicitud.personId}`} className="underline underline-offset-4">
            Ver el registro maestro de la persona
          </Link>
        </p>

        <Section title="Estado">
          <p className="text-lg">
            <Badge tone={solicitud.status === 'REJECTED' ? 'danger' : 'accent'}>
              {ESTADO_DE_SOLICITUD[solicitud.status] ?? solicitud.status}
            </Badge>
          </p>
          {solicitud.submittedAt !== null && (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Enviada el {fechaHora.format(solicitud.submittedAt)} · estatuto aceptado{' '}
              {solicitud.acceptedRuleSetVersion} · entidad {solicitud.legalEntity}
            </p>
          )}
          {solicitud.resolutionReason !== null && (
            <Notice
              tone={solicitud.status === 'REJECTED' ? 'danger' : 'neutral'}
              title={`Resolución${solicitud.resolvedBy === null ? '' : ` de ${solicitud.resolvedBy}`}`}
            >
              <p>{solicitud.resolutionReason}</p>
              {solicitud.resolutionAt !== null && (
                <p className="mt-1 text-sm">{fechaHora.format(solicitud.resolutionAt)}</p>
              )}
            </Notice>
          )}
        </Section>

        {esBorrador ? (
          <Section
            title="Completar la captura asistida"
            description="Lo que se guarde aquí queda en el servidor. Al enviar se congela el resumen y ya nadie puede tocarlo."
          >
            <Card>
              <AssistedForm
                applicationId={solicitud.id}
                personId={solicitud.personId}
                membershipTypeId={solicitud.membershipTypeId}
                category={solicitud.category}
                especialidades={
                  especialidades !== null && especialidades.ok
                    ? especialidades.data.map((una) => ({ value: una.id, label: una.name }))
                    : []
                }
                territorios={
                  territorios !== null && territorios.ok
                    ? territorios.data.map((unidad) => ({
                        value: unidad.id,
                        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
                      }))
                    : []
                }
                borrador={borrador}
              />
            </Card>
          </Section>
        ) : (
          <Section
            title="Lo que la persona envió"
            description="Tal como lo envió. La revisión anota y resuelve; no reescribe."
          >
            <dl className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
              {solicitud.category === 'UNION_MEMBER' ? (
                <>
                  <div className="p-4">
                    <dt className="font-medium">Actividad</dt>
                    <dd className="mt-1 text-[var(--color-ink-soft)]">
                      {solicitud.occupation ?? '—'}
                      {solicitud.workRelationKind !== null &&
                        ` · ${FORMA_DE_TRABAJO[solicitud.workRelationKind] ?? solicitud.workRelationKind}`}
                    </dd>
                  </div>
                  <div className="p-4">
                    <dt className="font-medium">Contacto con personas neurodivergentes</dt>
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
                      <dt className="font-medium">Lo que contó</dt>
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
        )}

        <Section title="Documentos" description="Se revisan uno por uno: rechazar todo por una foto borrosa es rehacer el trámite entero.">
          {solicitud.documentList.length === 0 ? (
            <EmptyState title="Sin documentos" description="Esta solicitud no lleva ninguno todavía." />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Documento</th>
                  <th scope="col" className="p-3 font-medium">Archivo</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Revisión</th>
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
                      <Badge
                        tone={
                          documento.status === 'REJECTED'
                            ? 'danger'
                            : documento.status === 'ACCEPTED'
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {ESTADO_DE_DOCUMENTO[documento.status] ?? documento.status}
                      </Badge>
                      {documento.reviewedAt !== null && (
                        <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">
                          {fecha.format(documento.reviewedAt)}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {documento.status !== 'SUBMITTED' ? (
                        <span className="text-sm">{documento.reviewNote ?? '—'}</span>
                      ) : puedeRevisar ? (
                        <DocumentReviewForm documentId={documento.id} applicationId={solicitud.id} />
                      ) : (
                        <span className="text-sm text-[var(--color-ink-soft)]">Sin revisar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </Section>

        <Section title="Actuaciones">
          {solicitud.reviews.length === 0 ? (
            <EmptyState
              title="Sin actuaciones todavía"
              description="Cada anotación queda con su fundamento, su autora y su fecha."
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
      </div>
    </PageShell>
  );
}
