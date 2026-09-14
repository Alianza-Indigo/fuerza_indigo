import Link from 'next/link';

import { Badge, Card, ErrorNotice, PageShell } from '@/design-system/primitives';
import { colorToken } from '@/design-system/tokens';
import { getIndigoAmbassador } from '@/modules/admin';
import { env } from '@/platform/config/env';
import { svgQr } from '@/platform/credentials/qr';
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
  const qr = svgQr(personalUrl, {
    titulo: `Enlace de afiliación del embajador ${ambassador.code}`,
    tinta: colorToken('--color-slate-900'),
    fondo: '#ffffff',
  });

  return (
    <PageShell title={ambassador.displayName} description={`Embajador Índigo ${ambassador.code}`}>
      <div className="space-y-8">
        <Link href="/superadmin/embajadores" className="inline-block underline underline-offset-4">← Volver al padrón</Link>
        <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Enlace personal</h2>
              <Badge tone={ambassador.status === 'ACTIVE' ? 'success' : ambassador.status === 'SUSPENDED' ? 'warning' : 'neutral'}>
                {ambassador.status === 'ACTIVE' ? 'Activo' : ambassador.status === 'SUSPENDED' ? 'Suspendido' : 'Baja'}
              </Badge>
            </div>
            <div
              className="mx-auto mt-4 w-52 rounded-lg border border-[var(--color-line)] bg-white p-2"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <a href={personalUrl} className="mt-4 block break-all text-center text-sm font-medium underline underline-offset-4">
              {personalUrl}
            </a>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Solicitudes</dt><dd className="text-2xl font-semibold">{ambassador.applicationCount}</dd></div>
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Beneficiarios</dt><dd className="text-2xl font-semibold">{ambassador.beneficiaryCount}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
              Al suspenderlo o darlo de baja, este enlace deja de atribuir y recibir registros.
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
