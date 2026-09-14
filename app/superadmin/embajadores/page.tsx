import Link from 'next/link';

import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable } from '@/design-system/primitives';
import { listIndigoAmbassadors } from '@/modules/admin';
import { currentActor } from '@/platform/http/request-context';
import { CreateAmbassadorForm } from './ambassador-forms';

export const metadata = { title: 'Embajadores Índigo', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STATUS = {
  ACTIVE: { label: 'Activo', tone: 'success' as const },
  SUSPENDED: { label: 'Suspendido', tone: 'warning' as const },
  CLOSED: { label: 'Baja', tone: 'neutral' as const },
};

export default async function AmbassadorsPage() {
  const actor = await currentActor();
  const ambassadors = await listIndigoAmbassadors(actor);

  return (
    <PageShell
      title="Embajadores Índigo"
      description="Padrón de afiliadores autorizados. No son agremiados, beneficiarios ni representantes del sindicato."
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Dar de alta un embajador</h2>
          <Card><CreateAmbassadorForm /></Card>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Padrón y resultados</h2>
          {!ambassadors.ok ? (
            <ErrorNotice title={ambassadors.error.message} />
          ) : ambassadors.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay Embajadores Índigo"
              description="Al crear el primero recibirá un código y un enlace personal para registrar afiliaciones."
            />
          ) : (
            <ScrollableTable caption="Embajadores Índigo y registros atribuidos">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Embajador</th>
                  <th scope="col" className="p-3 font-medium">Código</th>
                  <th scope="col" className="p-3 font-medium">Zona</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Solicitudes</th>
                  <th scope="col" className="p-3 font-medium">Beneficiarios</th>
                  <th scope="col" className="p-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {ambassadors.data.map((ambassador) => (
                  <tr key={ambassador.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">
                      <p className="font-medium">{ambassador.displayName}</p>
                      <p className="text-xs text-[var(--color-ink-soft)]">{ambassador.email}</p>
                    </td>
                    <td className="p-3 font-mono text-sm">{ambassador.code}</td>
                    <td className="p-3">{ambassador.territory ?? 'Sin zona asignada'}</td>
                    <td className="p-3"><Badge tone={STATUS[ambassador.status].tone}>{STATUS[ambassador.status].label}</Badge></td>
                    <td className="p-3 tabular-nums">{ambassador.applicationCount}</td>
                    <td className="p-3 tabular-nums">{ambassador.beneficiaryCount}</td>
                    <td className="p-3">
                      <Link href={`/superadmin/embajadores/${ambassador.id}`} className="font-medium underline underline-offset-4">
                        Administrar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>
      </div>
    </PageShell>
  );
}
