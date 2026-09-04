import Link from 'next/link';
import { Badge, EmptyState, ErrorNotice, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { myApplications } from '@/modules/membership';
import { ESTADO_DE_SOLICITUD } from './etiquetas';

export const metadata = { title: 'Mi afiliación', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TONO: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'accent',
  DOCUMENTATION_PENDING: 'warning',
  UNDER_REVIEW: 'accent',
  CLARIFICATION_REQUIRED: 'warning',
  APPROVED: 'success',
  PENDING_PAYMENT: 'warning',
  ACTIVATED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

/** Las solicitudes de la persona, con lo que le toca hacer primero. */
export default async function MiAfiliacionPage() {
  const actor = await currentActor();
  const solicitudes = await myApplications(actor);

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Mi afiliación"
      description="Tus solicitudes y en qué punto está cada una."
    >
      <div className="space-y-6">
        {!solicitudes.ok ? (
          <ErrorNotice title={solicitudes.error.message} />
        ) : solicitudes.data.length === 0 ? (
          <EmptyState
            title="Todavía no has enviado ninguna solicitud"
            description="Puedes afiliarte como agremiada o de forma honoraria."
            action={
              <Link
                href="/mi/afiliacion/solicitar"
                className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-accent)] px-5 font-medium text-[var(--color-on-accent)]"
              >
                Solicitar afiliación
              </Link>
            }
          />
        ) : (
          <>
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Folio</th>
                  <th scope="col" className="p-3 font-medium">Calidad</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Enviada</th>
                  <th scope="col" className="p-3 font-medium">Documentos</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.data.map((solicitud) => (
                  <tr key={solicitud.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      <Link
                        href={`/mi/afiliacion/${solicitud.id}`}
                        className="font-mono text-sm underline underline-offset-4"
                      >
                        {solicitud.folio}
                      </Link>
                    </td>
                    <td className="p-3">{solicitud.membershipType}</td>
                    <td className="p-3">
                      <Badge tone={TONO[solicitud.status] ?? 'neutral'}>
                        {ESTADO_DE_SOLICITUD[solicitud.status] ?? solicitud.status}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums">
                      {solicitud.submittedAt === null ? 'Sin enviar' : formatter.format(solicitud.submittedAt)}
                    </td>
                    <td className="p-3 text-sm">
                      {solicitud.documents.total === 0
                        ? 'Ninguno'
                        : `${solicitud.documents.total}${solicitud.documents.rejected > 0 ? `, ${solicitud.documents.rejected} por corregir` : ''}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>

            <p>
              <Link href="/mi/afiliacion/solicitar" className="underline underline-offset-4">
                Solicitar otra afiliación
              </Link>
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}
