import Link from 'next/link';
import { Card, EmptyState, ErrorNotice, Notice, PageShell, Prose } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { membershipTypeList, myApplications, specialtyOptions } from '@/modules/membership';
import { territoryOptions } from '@/modules/access';
import { ApplicationStepper } from './application-stepper';

export const metadata = { title: 'Solicitar afiliación', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Elección de calidad y trámite de afiliación (PRD §8.1, §8.2).
 *
 * Primero se elige a qué se afilia uno, con lo que cada calidad da escrito en
 * lenguaje claro; después empieza el trámite por pasos. Separar las dos cosas no
 * es un capricho de navegación: elegir calidad es una decisión, y el PRD §5.3
 * pide una decisión principal por bloque.
 */
export default async function SolicitarPage({
  searchParams,
}: {
  searchParams: Promise<{ calidad?: string }>;
}) {
  const { calidad } = await searchParams;
  const actor = await currentActor();

  const [calidades, mias] = await Promise.all([
    membershipTypeList(actor, { onlyActive: true }),
    myApplications(actor),
  ]);

  if (!calidades.ok) {
    return (
      <PageShell title="Solicitar afiliación">
        <ErrorNotice title={calidades.error.message} />
      </PageShell>
    );
  }

  const ahora = new Date();
  const disponibles = calidades.data.filter(
    (fila) => fila.effectiveFrom <= ahora && (fila.effectiveTo === null || fila.effectiveTo > ahora),
  );

  const elegida = calidad === undefined ? undefined : disponibles.find((fila) => fila.id === calidad);

  if (elegida === undefined) {
    const enCurso = mias.ok
      ? mias.data.filter(
          (solicitud) => !['REJECTED', 'WITHDRAWN', 'ACTIVATED'].includes(solicitud.status),
        )
      : [];

    return (
      <PageShell
        title="Solicitar afiliación"
        description="Elige a qué te quieres afiliar. Cada opción dice qué da y qué no."
      >
        <div className="space-y-6">
          {enCurso.length > 0 && (
            <Notice tone="warning" title="Ya tienes una solicitud en curso">
              <p>
                Folio {enCurso[0]!.folio}, en estado {enCurso[0]!.status.toLowerCase()}.{' '}
                <Link href={`/mi/afiliacion/${enCurso[0]!.id}`} className="underline underline-offset-4">
                  Consúltala
                </Link>{' '}
                en vez de enviar otra.
              </p>
            </Notice>
          )}

          {disponibles.length === 0 ? (
            <EmptyState
              title="Ahora mismo no hay ninguna calidad abierta a solicitudes"
              description="Escríbenos y te decimos cuándo se abre."
            />
          ) : (
            <ul className="space-y-4">
              {disponibles.map((fila) => (
                <li key={fila.id}>
                  <Card>
                    <h2 className="text-lg font-semibold">{fila.name}</h2>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{fila.legalEntity}</p>
                    <Prose>
                      <p>{fila.benefitsSummary}</p>
                    </Prose>
                    <ul className="mt-3 space-y-1 text-sm">
                      <li>
                        {fila.category === 'UNION_MEMBER'
                          ? fila.grantsPoliticalRights
                            ? 'Da voz y voto en asambleas mientras estés en pleno goce de derechos.'
                            : 'No da voto.'
                          : 'No da derechos electorales sindicales: no vota ni computa para el quórum.'}
                      </li>
                      <li>{fila.requiresPayment ? 'Tiene costo.' : 'No tiene costo.'}</li>
                      <li>
                        {fila.durationMonths === null
                          ? 'Vigente mientras no se dé de baja.'
                          : `Vigencia de ${fila.durationMonths} meses${fila.renewable ? ', renovable' : ''}.`}
                      </li>
                      <li>
                        {fila.requiresHumanReview
                          ? 'La revisa una persona antes de resolverse.'
                          : 'No requiere revisión previa.'}
                      </li>
                    </ul>
                    <p className="mt-4">
                      <Link
                        href={`/mi/afiliacion/solicitar?calidad=${fila.id}`}
                        className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-accent)] px-5 font-medium text-[var(--color-on-accent)]"
                      >
                        Empezar esta solicitud
                      </Link>
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageShell>
    );
  }

  const [especialidades, territorios] = await Promise.all([
    specialtyOptions(actor),
    territoryOptions(actor),
  ]);

  return (
    <PageShell title={`Solicitud de ${elegida.name}`} description={elegida.legalEntity}>
      <div className="space-y-6">
        <p>
          <Link href="/mi/afiliacion/solicitar" className="underline underline-offset-4">
            ← Elegir otra calidad
          </Link>
        </p>

        <ApplicationStepper
          categoria={elegida.category}
          membershipTypeId={elegida.id}
          membershipTypeName={elegida.name}
          especialidades={
            especialidades.ok
              ? especialidades.data.map((especialidad) => ({
                  value: especialidad.id,
                  label: especialidad.name,
                }))
              : []
          }
          territorios={
            territorios.ok
              ? territorios.data.map((unidad) => ({
                  value: unidad.id,
                  label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
                }))
              : []
          }
        />
      </div>
    </PageShell>
  );
}
