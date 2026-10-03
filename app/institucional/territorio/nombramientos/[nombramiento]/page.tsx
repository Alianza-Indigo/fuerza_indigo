import Link from 'next/link';

import { territorialAppointmentDetail } from '@/modules/governance';
import { currentActor } from '@/platform/http/request-context';
import { Badge, Card, ErrorNotice, PageShell } from '@/design-system/primitives';
import { SignedTerritorialAppointmentForm } from '../../territory-forms';

export const metadata = { title: 'Acuerdo de nombramiento territorial', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function TerritorialAppointmentPage({
  params,
}: {
  params: Promise<{ nombramiento: string }>;
}) {
  const actor = await currentActor();
  const { nombramiento } = await params;
  const result = await territorialAppointmentDetail(actor, nombramiento);

  if (!result.ok) {
    return (
      <PageShell title="Acuerdo de nombramiento territorial" width="lectura">
        <ErrorNotice title={result.error.message} />
      </PageShell>
    );
  }

  const appointment = result.data;
  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: actor.timeZone });

  return (
    <PageShell
      title={appointment.number}
      description={`Acuerdo de creación y nombramiento de ${appointment.unitName}.`}
      width="lectura"
    >
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--color-ink-soft)]">Emitido el {formatter.format(appointment.appointedOn)}</p>
              <p className="font-medium">{appointment.issuerName} · {appointment.issuerCapacity}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">Responsable: {appointment.responsibleName}</p>
            </div>
            <Badge tone={appointment.signedFileId === null ? 'warning' : 'success'}>
              {appointment.signedFileId === null ? 'Pendiente de copia firmada' : 'Copia firmada incorporada'}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href={`/territorio/${appointment.unitPublicId}`} className="underline underline-offset-4">
              Abrir panel territorial
            </Link>
            <a
              href={`/institucional/territorio/nombramientos/${appointment.publicId}/acuerdo`}
              className="underline underline-offset-4"
            >
              Descargar acuerdo generado
            </a>
            {appointment.signedFileId !== null && appointment.canDownloadSignedFile && (
              <a
                href={`/api/v1/files/${appointment.signedFileId}/pase`}
                className="underline underline-offset-4"
              >
                Descargar copia firmada
              </a>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Contenido expedido</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7">{appointment.agreementText}</pre>
        </Card>

        {appointment.signedFileId === null && appointment.canAttachSignedFile && (
          <Card>
            <h2 className="mb-2 font-semibold">Incorporar el documento firmado</h2>
            <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
              El acuerdo generado permanece intacto. Este archivo se conserva como su copia firmada.
            </p>
            <SignedTerritorialAppointmentForm
              appointmentId={appointment.id}
            />
          </Card>
        )}
      </div>
    </PageShell>
  );
}
