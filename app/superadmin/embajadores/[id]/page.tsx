import Link from 'next/link';

import { Badge, Card, ErrorNotice, LinkButton, PageShell } from '@/design-system/primitives';
import { getIndigoAmbassador } from '@/modules/admin';
import { env } from '@/platform/config/env';
import { svgCredencialDeEmbajador } from '@/platform/credentials/ambassador-design';
import { currentActor } from '@/platform/http/request-context';
import { UpdateAmbassadorForm } from '../ambassador-forms';

export const metadata = { title: 'Administrar Embajador Índigo', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AmbassadorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  const result = await getIndigoAmbassador(actor, id);
  if (!result.ok) {
    return <PageShell title="Embajador Índigo"><ErrorNotice title={result.error.message} /></PageShell>;
  }

  const ambassador = result.data;
  const personalUrl = `${env().APP_URL}/embajadores/${ambassador.code}`;
  const credential = ambassador.status === 'ACTIVE'
    ? svgCredencialDeEmbajador({
        displayName: ambassador.displayName,
        code: ambassador.code,
        territory: ambassador.territory,
        issuedAt: ambassador.createdAt,
        affiliationUrl: personalUrl,
      })
    : null;

  return (
    <PageShell title={ambassador.displayName} description={`Embajador Índigo ${ambassador.code}`}>
      <div className="space-y-8">
        <Link href="/superadmin/embajadores" className="inline-block underline underline-offset-4">← Volver al padrón</Link>
        <Card tone={credential === null ? 'warning' : 'accent'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Credencial digital</h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
                Identifica al afiliador y abre sus formularios mediante un QR. Puede compartirse en pantalla o descargarse para impresión.
              </p>
            </div>
            <Badge tone={ambassador.status === 'ACTIVE' ? 'success' : ambassador.status === 'SUSPENDED' ? 'warning' : 'neutral'}>
              {ambassador.status === 'ACTIVE' ? 'Activa' : ambassador.status === 'SUSPENDED' ? 'Suspendida' : 'Inactiva'}
            </Badge>
          </div>
          {credential === null ? (
            <p className="mt-5 rounded-lg bg-[var(--color-surface-sunken)] p-4 text-sm">
              Reactiva al embajador para habilitar su credencial y su enlace de afiliación.
            </p>
          ) : (
            <>
              <div
                className="mx-auto mt-6 w-full max-w-3xl overflow-hidden rounded-[1.6rem] shadow-[var(--shadow-raised)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: credential }}
              />
              <div className="mt-6 flex flex-wrap gap-3">
                <LinkButton href={`/superadmin/embajadores/${ambassador.id}/credencial`}>
                  Descargar credencial
                </LinkButton>
                <LinkButton href={personalUrl} variant="secondary">
                  Abrir enlace de afiliación
                </LinkButton>
              </div>
              <a href={personalUrl} className="mt-4 block break-all text-sm font-medium underline underline-offset-4">
                {personalUrl}
              </a>
            </>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
          <Card>
            <h2 className="text-lg font-semibold">Resultados de afiliación</h2>
            <div className="flex items-center justify-between gap-3">
              <span className="mt-1 text-sm text-[var(--color-ink-soft)]">Registros atribuidos a {ambassador.code}</span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Solicitudes</dt><dd className="text-2xl font-semibold">{ambassador.applicationCount}</dd></div>
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Beneficiarios</dt><dd className="text-2xl font-semibold">{ambassador.beneficiaryCount}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
              Al suspenderlo o darlo de baja, su QR y enlace dejan de recibir registros.
            </p>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Datos y estado</h2>
            <UpdateAmbassadorForm ambassador={ambassador} />
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
