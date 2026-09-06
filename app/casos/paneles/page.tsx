import Link from 'next/link';
import { Card, EmptyState, ErrorNotice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { panelsForActor } from '@/modules/cases';

export const metadata = { title: 'Paneles de coordinación', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Los paneles que esta persona puede abrir (PRD §24 Fase 6).
 *
 * No se enseñan los tres a todo el mundo: cada uno vive en una entidad y un
 * compartimento, y la lista se deriva de lo que quien mira puede coordinar. Una
 * portada con los tres nombres y dos que responden «no tienes autorización»
 * sería una lista de puertas cerradas.
 */
export default async function PanelesPage() {
  const actor = await currentActor();
  const paneles = await panelsForActor(actor);

  if (!paneles.ok) {
    return (
      <PageShell title="Paneles de coordinación" width="ancha">
        <ErrorNotice title={paneles.error.message} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Paneles de coordinación"
      description="Lo que hay que repartir en cada área, incluido lo que todavía no lleva nadie."
      width="ancha"
    >
      <Section title="Áreas que coordinas" level={2}>
        {paneles.data.length === 0 ? (
          <EmptyState
            title="No coordinas ninguna área"
            description="Los paneles los abre quien reparte expedientes. Si atiendes expedientes asignados, los tuyos están en «Mis expedientes»."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {paneles.data.map((panel) => (
              <li key={panel.codigo}>
                <Card>
                  <Link
                    href={`/casos/paneles/${panel.codigo}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {panel.nombre}
                  </Link>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{panel.descripcion}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  );
}
