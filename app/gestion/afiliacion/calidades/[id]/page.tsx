import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { membershipTypeFormOptions, membershipTypeList } from '@/modules/membership';
import { QualityForm } from '../quality-form';

export const metadata = { title: 'Editar calidad', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Edición de una calidad. La categoría y los derechos no se ofrecen (ADR-0075). */
export default async function CalidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const [calidades, opciones] = await Promise.all([
    membershipTypeList(actor),
    membershipTypeFormOptions(actor),
  ]);

  if (!calidades.ok) {
    return (
      <PageShell title="Editar calidad">
        <ErrorNotice title={calidades.error.message} />
      </PageShell>
    );
  }

  const calidad = calidades.data.find((fila) => fila.id === id);
  if (calidad === undefined) notFound();

  const fecha = (valor: Date | null): string => (valor === null ? '' : valor.toISOString().slice(0, 10));

  return (
    <PageShell title={calidad.name} description={`Código ${calidad.code} · ${calidad.legalEntity}`}>
      <div className="space-y-8">
        <p>
          <Link href="/gestion/afiliacion/calidades" className="underline underline-offset-4">
            ← Volver a las calidades
          </Link>
        </p>

        <Notice
          tone="neutral"
          title={
            calidad.category === 'UNION_MEMBER'
              ? 'Calidad sindical'
              : 'Calidad honoraria, sin derechos políticos sindicales'
          }
        >
          <p>
            {calidad.category === 'UNION_MEMBER'
              ? `${calidad.grantsPoliticalRights ? 'Concede voz y voto' : 'No concede voto'}; ${calidad.countsForQuorum ? 'computa' : 'no computa'} para el quórum; ${calidad.appearsInAuthorityRoster ? 'aparece' : 'no aparece'} en el padrón que se remite a la autoridad laboral.`
              : 'No vota, no computa para el quórum y no aparece como agremiada ante autoridades.'}
          </p>
          <p className="mt-2">
            Ni la categoría ni los derechos se editan aquí. Cambiarlos daría o quitaría el voto, hacia atrás, a
            las {calidad.liveMemberships} membresías de este tipo. Una calidad distinta es una calidad nueva.
          </p>
        </Notice>

        <Section title="Editar">
          {!opciones.ok ? (
            <ErrorNotice title={opciones.error.message} />
          ) : (
            <Card>
              <QualityForm
                entidades={opciones.data.legalEntities.map((entidad) => ({
                  value: entidad.id,
                  label: entidad.name,
                }))}
                conceptos={opciones.data.catalogProducts
                  .filter((producto) => producto.legalEntityId === calidad.legalEntityId)
                  .map((producto) => ({ value: producto.id, label: `${producto.name} (${producto.code})` }))}
                valores={{
                  membershipTypeId: calidad.id,
                  name: calidad.name,
                  benefitsSummary: calidad.benefitsSummary,
                  requiresHumanReview: calidad.requiresHumanReview,
                  requiresPayment: calidad.requiresPayment,
                  renewable: calidad.renewable,
                  isActive: calidad.isActive,
                  catalogProductId: calidad.catalogProductId ?? '',
                  durationMonths: calidad.durationMonths === null ? '' : String(calidad.durationMonths),
                  effectiveFrom: fecha(calidad.effectiveFrom),
                  effectiveTo: fecha(calidad.effectiveTo),
                }}
              />
            </Card>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
