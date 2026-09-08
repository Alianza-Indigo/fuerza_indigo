import Link from 'next/link';
import { Card, EmptyState, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { panelDeGestion } from '@/modules/dashboards';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tablero de gestión', robots: { index: false, follow: false } };

/**
 * El tablero del área de gestión (PRD §5.5, §24 Fase 9 criterio 6).
 *
 * Abre con lo que hay que decidir, no con métricas: las colas de trabajo que
 * esta persona puede atender, cada una con su enlace. Lo que no alcanza no
 * aparece; si no hay nada pendiente, lo dice. Quien busca una sección concreta la
 * tiene en la navegación del marco.
 */
export default async function GestionTableroPage() {
  const actor = await currentActor();
  const panel = await panelDeGestion(actor);
  const tareas = panel.ok ? panel.data.tareas : [];

  return (
    <PageShell
      title="Tablero de gestión"
      description="Lo que espera una decisión en tus áreas. Cada tarjeta lleva a donde se atiende."
      width="ancha"
    >
      <Section title="Pendientes">
        {tareas.length === 0 ? (
          <EmptyState
            title="Nada pendiente por ahora"
            description="No hay colas con trabajo en tus áreas. Cuando algo requiera una decisión, aparecerá aquí. Mientras tanto, usa la navegación de arriba para entrar a una sección."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {tareas.map((t) => (
              <li key={t.id}>
                <Card>
                  <h3 className="text-lg font-semibold">{t.titulo}</h3>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{t.detalle}</p>
                  <p className="mt-4">
                    <Link href={t.accion.href} className="font-medium underline underline-offset-4">
                      {t.accion.etiqueta}
                    </Link>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  );
}
