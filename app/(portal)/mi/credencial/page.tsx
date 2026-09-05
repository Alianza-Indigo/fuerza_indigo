import Link from 'next/link';
import { Card, EmptyState, ErrorNotice, Notice, PageShell, Prose, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { personCredentials } from '@/modules/membership';
import { formatDate } from '@/platform/i18n/format';
import { codigoLegible } from '@/platform/credentials/design';
import { svgQr } from '@/platform/credentials/qr';
import { colorToken } from '@/design-system/tokens';
import { env } from '@/platform/config/env';
import { ETIQUETA_DE_ESTADO, ETIQUETA_DE_TIPO } from '../../../(publico)/verificar/etiquetas';

export const metadata = { title: 'Mi credencial', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * La credencial de la persona (PRD §7.4, F4-CRE-002).
 *
 * Enseña el QR **en pantalla** además de dejar descargarla: en una puerta, lo
 * que se usa es el teléfono, no un archivo impreso. Y enseña el código en
 * letra grande y separado en bloques, porque no siempre hay cámara enfrente.
 *
 * Las credenciales que ya no valen no desaparecen de aquí: se ven, con su
 * estado y con la fecha en que dejaron de valer. Borrarlas dejaría a la persona
 * sin saber qué pasó con la que llevaba en la cartera.
 */
export default async function MiCredencialPage() {
  const actor = await currentActor();
  if (actor.personId === null) {
    return (
      <PageShell title="Mi credencial">
        <ErrorNotice title="Para ver tu credencial necesitas entrar con tu cuenta." />
      </PageShell>
    );
  }

  const credenciales = await personCredentials(actor, actor.personId);
  if (!credenciales.ok) {
    return (
      <PageShell title="Mi credencial">
        <ErrorNotice title={credenciales.error.message} />
      </PageShell>
    );
  }

  const vigentes = credenciales.data.filter((una) => una.status === 'ACTIVE');
  const pasadas = credenciales.data.filter((una) => una.status !== 'ACTIVE');
  const tinta = colorToken('--color-slate-900');

  return (
    <PageShell
      title="Mi credencial"
      description="Tu credencial digital, con su código para verificarla. Puedes enseñarla desde el teléfono o descargarla para imprimirla."
    >
      <div className="space-y-8">
        {credenciales.data.length === 0 && (
          <EmptyState
            title="Todavía no tienes credencial"
            description="La credencial se emite cuando se activa tu membresía. Si acabas de afiliarte y aún no aparece, revisa el estado de tu solicitud."
            action={
              <Link href="/mi/afiliacion" className="underline underline-offset-4">
                Ver mi afiliación
              </Link>
            }
          />
        )}

        {vigentes.map((credencial) => {
          const qr = svgQr(credencial.token, {
            titulo: `Código de verificación ${codigoLegible(credencial.publicCode)}`,
            tinta,
            fondo: '#ffffff',
          });
          return (
            <Section key={credencial.id} title={ETIQUETA_DE_TIPO[credencial.kind]}>
              <Card>
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                  <div
                    className="w-48 shrink-0 self-center rounded-lg border border-[var(--color-line)] bg-white p-2 sm:self-start"
                    // El SVG lo compone `platform/credentials/qr` a partir del
                    // token: no viene de ninguna entrada de persona.
                    dangerouslySetInnerHTML={{ __html: qr }}
                  />
                  <div className="min-w-0 flex-1 space-y-4">
                    <div>
                      <p className="text-2xl font-semibold">{credencial.displayName}</p>
                      {credencial.territoryLabel !== null && (
                        <p className="text-[var(--color-ink-soft)]">{credencial.territoryLabel}</p>
                      )}
                    </div>

                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm text-[var(--color-ink-soft)]">Código de verificación</dt>
                        <dd className="font-mono text-lg tracking-wide">
                          {codigoLegible(credencial.publicCode)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-[var(--color-ink-soft)]">Vigencia</dt>
                        <dd>
                          {credencial.expiresAt === null
                            ? 'Sin fecha de término'
                            : `Hasta el ${formatDate(credencial.expiresAt)}`}
                        </dd>
                      </div>
                      {credencial.memberNumber !== null && (
                        <div>
                          <dt className="text-sm text-[var(--color-ink-soft)]">Número de miembro</dt>
                          <dd className="font-mono">{credencial.memberNumber}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-sm text-[var(--color-ink-soft)]">Emitida</dt>
                        <dd>{formatDate(credencial.issuedAt)}</dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap gap-3">
                      <a
                        href={`/mi/credencial/${credencial.id}/descargar`}
                        className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-accent)] px-4 font-medium text-[var(--color-ink-inverse)]"
                        download
                      >
                        Descargar para imprimir
                      </a>
                      <Link
                        href={`/verificar/${credencial.token}`}
                        className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-line-strong)] px-4 font-medium"
                      >
                        Ver lo que verá quien la escanee
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            </Section>
          );
        })}

        {pasadas.length > 0 && (
          <Section
            title="Credenciales que ya no están en vigor"
            description="Se quedan aquí para que sepas qué pasó con cada una."
          >
            <div className="space-y-3">
              {pasadas.map((credencial) => {
                const estado = ETIQUETA_DE_ESTADO[credencial.status];
                return (
                  <Notice key={credencial.id} tone={estado.tono} title={estado.titulo} live="none">
                    <p>
                      {ETIQUETA_DE_TIPO[credencial.kind]} · {codigoLegible(credencial.publicCode)}
                    </p>
                    <p>{estado.explicacion}</p>
                    {credencial.revokedAt !== null && (
                      <p>Dejó de valer el {formatDate(credencial.revokedAt)}.</p>
                    )}
                  </Notice>
                );
              })}
            </div>
          </Section>
        )}

        <Prose>
          <h2>Cómo se verifica</h2>
          <p>
            Quien escanee el código llega a <strong>{env().APP_URL}/verificar</strong> y ve tu nombre,
            qué acredita la credencial, su estado y su vigencia. No ve tu correo, ni tu teléfono, ni tu
            número de miembro.
          </p>
          <p>
            Si pierdes la credencial impresa, avisa a la organización: se repone con un código nuevo y el
            anterior deja de valer en el acto.
          </p>
        </Prose>
      </div>
    </PageShell>
  );
}
