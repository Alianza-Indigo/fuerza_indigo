import Link from 'next/link';
import { Badge, EmptyState, ErrorNotice, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { listPerson360Index } from '@/modules/admin';

export const metadata = { title: 'Personas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const actor = await currentActor();
  const people = await listPerson360Index(actor);

  return (
    <PageShell
      title="Personas"
      description="Índice completo del registro maestro. Cada persona abre una Vista 360°, tenga o no cuenta digital."
      width="ancha"
    >
      {!people.ok ? (
        <ErrorNotice title={people.error.message} />
      ) : people.data.length === 0 ? (
        <EmptyState title="Todavía no hay personas registradas" />
      ) : (
        <ScrollableTable caption="Personas del registro maestro y sus relaciones principales">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left">
              <th className="p-3">Persona</th>
              <th className="p-3">Correo</th>
              <th className="p-3">Cuenta</th>
              <th className="p-3">Territorio</th>
              <th className="p-3">Membresías</th>
              <th className="p-3">Beneficiario</th>
              <th className="p-3">Casos</th>
            </tr>
          </thead>
          <tbody>
            {people.data.map((person) => (
              <tr key={person.publicId} className="border-b border-[var(--color-line)] last:border-0">
                <td className="p-3">
                  <Link href={`/superadmin/personas/${person.publicId}`} className="font-medium underline underline-offset-4">
                    {person.displayName}
                  </Link>
                  {person.archived && <Badge tone="neutral">Archivado</Badge>}
                </td>
                <td className="p-3 text-sm">{person.primaryEmail ?? '—'}</td>
                <td className="p-3">{person.accountStatus ?? 'Sin cuenta'}</td>
                <td className="p-3">{person.territory ?? '—'}</td>
                <td className="p-3 tabular-nums">{person.memberships}</td>
                <td className="p-3 tabular-nums">{person.beneficiaryRecords}</td>
                <td className="p-3 tabular-nums">{person.cases}</td>
              </tr>
            ))}
          </tbody>
        </ScrollableTable>
      )}
    </PageShell>
  );
}
