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
import {
  CloseClarificationForm,
  RecommendationForm,
  RequestClarificationForm,
  ResolutionForm,
  StartReviewForm,
} from './review-forms';

export const metadata = { title: 'Solicitud de afiliación', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Expediente de una solicitud para quien la revisa (PRD §8.1, pasos 9 y 10).
 *
 * Muestra el resumen inmutable —lo que la persona envió, tal como lo envió—, los
 * documentos con su revisión individual, las aclaraciones con su plazo y las
 * actuaciones. Un expediente que esconde su historial no es un expediente.
 *
 * Las acciones aparecen **según el estado**, y solo las que en ese momento
 * tienen sentido. Ofrecer «resolver» sobre una solicitud con una aclaración
 * abierta sería ofrecer un botón cuya única función es dar un error.
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
    legalEntityId: solicitud.legalEntityId,
  }).allowed;
  // Resolver exige motivo escrito, y el motor lo comprueba. Aquí se pregunta con
  // uno de mentira solo para saber si la persona tiene la facultad: sin esto, la
  // sección de resolución no aparecería nunca aunque quien mira sí pudiera
  // resolver, y quien puede resolver no encontraría dónde.
  const puedeResolver = can(
    { ...actor, reason: 'comprobación de facultades para mostrar la sección' },
    'membership.application.resolve',
    { kind: 'MembershipApplication', id: solicitud.id, legalEntityId: solicitud.legalEntityId },
  ).allowed;

  const EN_TRAMITE = ['SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED'];
  const enTramite = EN_TRAMITE.includes(solicitud.status);
  const aclaracionAbierta = solicitud.clarifications.find(
    (aclaracion) => aclaracion.state === 'PENDING' || aclaracion.state === 'OVERDUE',
  );

  // Quién la tiene tomada. Se dice **fuera** de la sección de revisión, que es
  // justo la que desaparece al tomarla: un mensaje de resultado dentro de la
  // rama que la propia acción hace desaparecer no lo lee nadie (ADR-0074).
  const tomadaPor = [...solicitud.reviews].reverse().find((revision) => revision.action === 'ASSIGNED');

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
          {tomadaPor !== undefined && solicitud.resolutionAt === null && (
            <p className="mt-2">
              La está revisando <strong>{tomadaPor.reviewer}</strong>, desde el{' '}
              {fechaHora.format(tomadaPor.createdAt)}.
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

        <Section
          title="Aclaraciones"
          description="Lo que se pidió, hasta cuándo y qué contestó la persona."
        >
          {solicitud.clarifications.length === 0 ? (
            <EmptyState
              title="No se ha pedido ninguna aclaración"
              description="Se pide cuando falta algo que solo la persona puede aportar."
            />
          ) : (
            <ol className="space-y-3">
              {solicitud.clarifications.map((aclaracion) => (
                <li key={aclaracion.id} className="rounded-lg border border-[var(--color-line)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">Se pidió el {fecha.format(aclaracion.requestedAt)}</p>
                    <Badge
                      tone={
                        aclaracion.state === 'ANSWERED'
                          ? 'success'
                          : aclaracion.state === 'OVERDUE'
                            ? 'danger'
                            : aclaracion.state === 'CLOSED'
                              ? 'neutral'
                              : 'accent'
                      }
                    >
                      {aclaracion.state === 'ANSWERED'
                        ? 'Contestada'
                        : aclaracion.state === 'OVERDUE'
                          ? 'Plazo vencido'
                          : aclaracion.state === 'CLOSED'
                            ? 'Cerrada sin respuesta'
                            : 'En plazo'}
                    </Badge>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap">{aclaracion.request}</p>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    {aclaracion.requestedBy} · plazo hasta el {fecha.format(aclaracion.dueAt)}
                    {aclaracion.notifiedAt === null
                      ? ' · sin aviso enviado'
                      : ` · avisada el ${fechaHora.format(aclaracion.notifiedAt)}`}
                  </p>

                  {aclaracion.answer !== null && aclaracion.answeredAt !== null && (
                    <div className="mt-3 rounded-lg bg-[var(--color-surface-sunken)] p-3">
                      <p className="text-sm font-medium">Contestó el {fechaHora.format(aclaracion.answeredAt)}</p>
                      <p className="mt-1 whitespace-pre-wrap">{aclaracion.answer}</p>
                    </div>
                  )}

                  {aclaracion.closeReason !== null && (
                    <p className="mt-3 text-sm">
                      <strong>Se cerró sin respuesta:</strong> {aclaracion.closeReason}
                    </p>
                  )}

                  {puedeRevisar &&
                    (aclaracion.state === 'PENDING' || aclaracion.state === 'OVERDUE') && (
                      <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                        <CloseClarificationForm
                          clarificationId={aclaracion.id}
                          applicationId={solicitud.id}
                        />
                      </div>
                    )}
                </li>
              ))}
            </ol>
          )}
        </Section>

        {puedeRevisar && enTramite && (
          <Section title="Revisar" description="Revisar no altera lo que la persona envió.">
            <div className="space-y-6">
              {solicitud.status !== 'UNDER_REVIEW' && aclaracionAbierta === undefined && (
                <Card>
                  <h3 className="mb-3 font-semibold">Tomar la solicitud</h3>
                  <StartReviewForm applicationId={solicitud.id} />
                </Card>
              )}

              {aclaracionAbierta === undefined ? (
                <Card>
                  <h3 className="mb-3 font-semibold">Pedir una aclaración</h3>
                  <RequestClarificationForm applicationId={solicitud.id} />
                </Card>
              ) : (
                <Notice tone="neutral" title="Hay una aclaración abierta">
                  <p>
                    Esperando la respuesta de la persona hasta el {fecha.format(aclaracionAbierta.dueAt)}. Para
                    seguir sin ella, ciérrala arriba explicando por qué.
                  </p>
                </Notice>
              )}

              {solicitud.status === 'UNDER_REVIEW' && (
                <Card>
                  <h3 className="mb-3 font-semibold">Recomendar</h3>
                  <RecommendationForm applicationId={solicitud.id} />
                </Card>
              )}
            </div>
          </Section>
        )}

        {puedeResolver && enTramite && (
          <Section
            title="Resolver"
            description="Quien revisa prepara; quien resuelve firma. El PRD §8.1 las separa a propósito."
          >
            {aclaracionAbierta !== undefined ? (
              <Notice tone="warning" title="No se resuelve con una aclaración abierta">
                <p>
                  Se le pidió algo a la persona y el plazo corre hasta el{' '}
                  {fecha.format(aclaracionAbierta.dueAt)}. Resolver ahora sería pedirle que conteste y no
                  esperar la respuesta.
                </p>
              </Notice>
            ) : solicitud.reviews.length === 0 ? (
              <Notice tone="warning" title="Todavía no hay ninguna revisión">
                <p>
                  La admisión exige revisión humana registrada antes de resolver (PRD §3.2). Toma la solicitud
                  y revísala primero.
                </p>
              </Notice>
            ) : (
              <Card>
                <ResolutionForm applicationId={solicitud.id} />
              </Card>
            )}
          </Section>
        )}

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
