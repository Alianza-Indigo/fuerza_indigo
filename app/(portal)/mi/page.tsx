import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  PageShell,
  Section,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { personalAgenda, type UrgenciaDePendiente } from '@/modules/membership';
import { formatDate } from '@/platform/i18n/format';
import { CALIDAD_EXACTA } from '../../gestion/afiliacion/padrones/etiquetas';
import { ESTADO_DE_MEMBRESIA } from '../../gestion/afiliacion/membresias/etiquetas';

export const metadata = { title: 'Mi cuenta', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * El panel personal (PRD §5.5, §6.2; F4-UI-001).
 *
 * **Abre con decisiones, no con métricas.** El PRD §5.5 lo exige —«cada panel
 * abrirá con prioridades reales»— y el §24 lo repite como criterio de
 * aceptación: «los paneles muestran decisiones accionables, no métricas
 * decorativas». Por eso aquí no hay contadores ni gráficas: hay una lista de
 * cosas que la persona puede hacer hoy, cada una con el enlace a donde se hace.
 *
 * Cuando no hay nada pendiente, la pantalla lo dice y se calla. Inventar
 * tarjetas para llenar el espacio enseña a no mirarlo, y el día que aparezca
 * algo urgente estará entre el ruido.
 */

/** Cómo se anuncia cada grado de urgencia, sin depender solo del color. */
const URGENCIA: Record<UrgenciaDePendiente, { readonly etiqueta: string; readonly tono: 'danger' | 'warning' | 'neutral' }> = {
  PLAZO: { etiqueta: 'Tiene plazo', tono: 'danger' },
  BLOQUEA: { etiqueta: 'Bloquea un trámite', tono: 'warning' },
  CADUCA: { etiqueta: 'Está por caducar', tono: 'warning' },
  REVISAR: { etiqueta: 'Conviene revisar', tono: 'neutral' },
};

export default async function MiPanelPage() {
  const actor = await currentActor();
  const agenda = await personalAgenda(actor);

  if (!agenda.ok) {
    return (
      <PageShell title="Mi cuenta">
        <ErrorNotice title={agenda.error.message} />
      </PageShell>
    );
  }

  const { pendientes, calidades, credencialesVigentes, apareceEnDirectorio } = agenda.data;

  return (
    <PageShell
      title="Mi cuenta"
      description="Lo que tienes pendiente, primero. Después, tu relación con Fuerza Índigo."
    >
      <div className="space-y-8">
        <Section title={pendientes.length === 0 ? 'Nada pendiente' : 'Lo que necesita tu atención'}>
          {pendientes.length === 0 ? (
            <EmptyState
              title="No tienes nada pendiente"
              description="Cuando haya algo que decidir o que atender, aparecerá aquí antes que nada. Mientras tanto, esta pantalla se queda callada a propósito."
            />
          ) : (
            <ul className="space-y-4">
              {pendientes.map((pendiente) => {
                const urgencia = URGENCIA[pendiente.urgencia];
                return (
                  <li key={pendiente.id}>
                    <Card>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={urgencia.tono}>{urgencia.etiqueta}</Badge>
                            {pendiente.venceEl !== null && (
                              <span className="text-sm text-[var(--color-ink-soft)]">
                                {formatDate(pendiente.venceEl)}
                              </span>
                            )}
                          </div>
                          <p className="text-lg font-semibold">{pendiente.titulo}</p>
                          <p className="text-[var(--color-ink-soft)]">{pendiente.detalle}</p>
                        </div>
                        <Link
                          href={pendiente.accion.href}
                          className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[var(--color-accent)] px-4 font-medium text-[var(--color-ink-inverse)]"
                        >
                          {pendiente.accion.etiqueta}
                        </Link>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Mi relación con Fuerza Índigo">
          {calidades.length === 0 ? (
            <EmptyState
              title="Todavía no tienes una membresía activa"
              description="Puedes afiliarte como agremiada o de forma honoraria. El trámite empieza en Mi afiliación."
              action={
                <Link href="/mi/afiliacion/solicitar" className="underline underline-offset-4">
                  Empezar una solicitud
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {calidades.map((calidad) => (
                <Card key={calidad.memberNumber}>
                  <div className="space-y-1">
                    <p className="font-mono text-sm text-[var(--color-ink-soft)]">{calidad.memberNumber}</p>
                    <p className="text-lg font-semibold">
                      {CALIDAD_EXACTA[calidad.categoria] ?? calidad.categoria}
                    </p>
                    <p>{ESTADO_DE_MEMBRESIA[calidad.estado] ?? calidad.estado}</p>
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      {calidad.expiresAt === null
                        ? 'Sin fecha de término'
                        : `Vigente hasta el ${formatDate(calidad.expiresAt)}`}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>

        <Section title="Lo demás de tu cuenta">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="font-semibold">Mi credencial</p>
              <p className="text-[var(--color-ink-soft)]">
                {credencialesVigentes === 0
                  ? 'Todavía no tienes credencial vigente.'
                  : `Tienes ${credencialesVigentes} credencial(es) en vigor, con su código para verificarlas.`}
              </p>
              <Link href="/mi/credencial" className="mt-2 inline-block underline underline-offset-4">
                Ver mi credencial
              </Link>
            </Card>

            <Card>
              <p className="font-semibold">Mi ficha pública</p>
              <p className="text-[var(--color-ink-soft)]">
                {apareceEnDirectorio
                  ? 'Apareces en el directorio público, con lo que autorizaste.'
                  : 'No apareces en el directorio público. Es lo que pasa si no haces nada.'}
              </p>
              <Link href="/mi/directorio" className="mt-2 inline-block underline underline-offset-4">
                Decidir sobre mi ficha
              </Link>
            </Card>

            <Card>
              <p className="font-semibold">Consentimientos y privacidad</p>
              <p className="text-[var(--color-ink-soft)]">
                Para qué autorizaste que se usen tus datos, y cómo retirarlo.
              </p>
              <Link href="/mi/consentimientos" className="mt-2 inline-block underline underline-offset-4">
                Revisar mis consentimientos
              </Link>
            </Card>

            <Card>
              <p className="font-semibold">Seguridad y sesiones</p>
              <p className="text-[var(--color-ink-soft)]">
                Dónde tienes la sesión abierta y cómo cerrarla desde aquí.
              </p>
              <Link href="/mi/seguridad" className="mt-2 inline-block underline underline-offset-4">
                Ver mis sesiones
              </Link>
            </Card>
          </div>
        </Section>
      </div>
    </PageShell>
  );
}
