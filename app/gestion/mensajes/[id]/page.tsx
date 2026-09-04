import Link from 'next/link';
import { Badge, Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import type { SupportRequestStatus } from '@prisma-client/enums';
import { requestDetail } from '@/modules/support';
import { REQUEST_TYPE_LABELS } from '../../../(publico)/contacto/labels';
import { ResolveForm } from './resolve-form';

export const metadata = { title: 'Mensaje recibido', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Readonly<Record<SupportRequestStatus, { etiqueta: string; tono: 'neutral' | 'warning' | 'success' }>> = {
  RECEIVED: { etiqueta: 'Sin atender', tono: 'warning' },
  // Los tres estados de la Fase 6 se etiquetan aunque ninguna ruta de esta fase
  // los escriba: el enumerado está contratado y una pantalla que enseñara su
  // nombre interno sería peor que una que ya sepa nombrarlos.
  TRIAGE: { etiqueta: 'En valoración', tono: 'warning' },
  CONVERTED_TO_CASE: { etiqueta: 'Convertida en expediente', tono: 'success' },
  REFERRED_EXTERNALLY: { etiqueta: 'Canalizada fuera', tono: 'success' },
  HANDLED: { etiqueta: 'Atendida', tono: 'success' },
  CLOSED_NO_ACTION: { etiqueta: 'Cerrada sin acción', tono: 'neutral' },
  DUPLICATE: { etiqueta: 'Duplicada', tono: 'neutral' },
};

/**
 * Un mensaje de la entrada pública.
 *
 * Abrir esta pantalla **escribe en la bitácora**: consta quién leyó y cuándo.
 * Se dice en la propia pantalla porque quien lee tiene derecho a saber que su
 * lectura queda registrada, igual que quien escribió tiene derecho a saber
 * quién la leyó.
 */
export default async function MensajePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  const mensaje = await requestDetail(actor, id);

  if (!mensaje.ok) {
    return (
      <PageShell title="Mensaje recibido" width="lectura">
        <ErrorNotice title={mensaje.error.message}>
          <Link href="/gestion/mensajes" className="underline underline-offset-4">
            Volver a la bandeja
          </Link>
        </ErrorNotice>
      </PageShell>
    );
  }

  const datos = mensaje.data;
  const formatter = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  return (
    <PageShell
      title={datos.subject}
      description={`Folio ${datos.folio} · ${REQUEST_TYPE_LABELS[datos.requestType].label} · ${datos.legalEntityShortName}`}
      width="lectura"
    >
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={ESTADO[datos.status].tono}>{ESTADO[datos.status].etiqueta}</Badge>
          <span className="text-sm text-[var(--color-ink-soft)]">
            Recibido el {formatter.format(datos.receivedAt)}
          </span>
        </div>

        <Section title="Lo que escribió" level={2}>
          <Card>
            <p className="whitespace-pre-wrap text-lg leading-relaxed">{datos.narrative}</p>
          </Card>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]" data-secondary>
            Este texto es el original y no se puede modificar: la aplicación no tiene privilegio para alterarlo.
          </p>
        </Section>

        <Section title="Cómo contestarle" level={2}>
          <Card>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Quiere que le llamen</dt>
                <dd className="font-medium">{datos.contactName}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Prefiere que le contesten</dt>
                <dd className="font-medium">{datos.preferredChannel === 'EMAIL' ? 'Por correo' : 'Por teléfono'}</dd>
              </div>
              {datos.contactEmail !== null && (
                <div>
                  <dt className="text-sm text-[var(--color-ink-soft)]">Correo</dt>
                  <dd className="font-medium">
                    <a href={`mailto:${datos.contactEmail}`} className="underline underline-offset-4">
                      {datos.contactEmail}
                    </a>
                  </dd>
                </div>
              )}
              {datos.contactPhone !== null && (
                <div>
                  <dt className="text-sm text-[var(--color-ink-soft)]">Teléfono</dt>
                  <dd className="font-medium">
                    <a href={`tel:${datos.contactPhone.replace(/[^0-9+]/g, '')}`} className="underline underline-offset-4">
                      {datos.contactPhone}
                    </a>
                  </dd>
                </div>
              )}
              {datos.territoryHint !== null && (
                <div>
                  <dt className="text-sm text-[var(--color-ink-soft)]">Escribe desde</dt>
                  <dd className="font-medium">{datos.territoryHint}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Aviso de privacidad aceptado</dt>
                <dd className="font-medium">
                  Versión {datos.privacyNoticeVersion}, el {formatter.format(datos.acceptedAt)}
                </dd>
              </div>
            </dl>
          </Card>
        </Section>

        {datos.requestType === 'VIOLENCE_OR_URGENCY' && (
          <Notice title="Marcado como violencia o urgencia" tone="danger" live="none">
            <p>
              Quien escribió eligió este tipo. Atiéndelo antes que el resto y, si describe un peligro en curso,
              recuérdale el 911 en tu respuesta.
            </p>
          </Notice>
        )}

        <Section title={datos.status === 'RECEIVED' ? 'Hazte cargo' : 'Qué se hizo'} level={2}>
          {datos.status === 'RECEIVED' ? (
            <Card>
              <ResolveForm requestId={datos.id} />
            </Card>
          ) : (
            <Card>
              <p className="whitespace-pre-wrap">{datos.handlingNote}</p>
              <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                {datos.handledByLabel ?? 'Alguien'}
                {datos.handledAt === null ? '' : `, el ${formatter.format(datos.handledAt)}`}
              </p>
            </Card>
          )}
        </Section>

        <p className="text-sm text-[var(--color-ink-soft)]" data-secondary>
          Abrir este mensaje quedó registrado en la bitácora institucional con tu nombre y la fecha.
        </p>
      </div>
    </PageShell>
  );
}
