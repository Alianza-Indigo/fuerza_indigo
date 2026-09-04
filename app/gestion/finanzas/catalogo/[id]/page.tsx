import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Card,
  ErrorNotice,
  Notice,
  PageShell,
  ScrollableTable,
  Section,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { catalogList, currentPrice, priceHistory } from '@/modules/billing';
import { formatMoney, todayInZone } from '@/platform/i18n';
import { PriceForm } from './price-form';
import { LifecycleForm } from './lifecycle-form';

export const metadata = { title: 'Concepto del catálogo', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PERIODICIDAD: Record<string, string> = {
  MONTH: 'al mes',
  QUARTER: 'al trimestre',
  SEMESTER: 'al semestre',
  YEAR: 'al año',
};

/**
 * Un concepto y la historia de su precio.
 *
 * El historial es el punto de esta pantalla. Es lo que permite responder en una
 * asamblea por qué un cobro de marzo fue de una cantidad y el de septiembre de
 * otra, sin más prueba que la propia tabla.
 */
export default async function ConceptoPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  const { id } = await params;

  const [historial, catalogo] = await Promise.all([
    priceHistory(actor, id),
    catalogList(actor, { includeArchived: true }),
  ]);

  // Un concepto fuera del alcance de quien mira no existe para esta pantalla.
  // Distinguir «no lo tienes» de «no está» diría cuáles hay.
  if (!historial.ok && historial.error.code === 'NOT_FOUND') notFound();

  const concepto = catalogo.ok ? catalogo.data.find((fila) => fila.id === id) : undefined;
  if (concepto === undefined) {
    if (!catalogo.ok) return <ErrorNotice title={catalogo.error.message} />;
    notFound();
  }

  const vigente = await currentPrice(id);

  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const fecha = new Intl.DateTimeFormat(actor.locale, { dateStyle: 'medium', timeZone: actor.timeZone });
  const hoy = todayInZone(actor.timeZone);

  return (
    <PageShell title={concepto.name} description={concepto.description} width="ancha">
      <div className="space-y-10">
        <p>
          <Link href="/gestion/finanzas/catalogo" className="inline-flex min-h-11 items-center underline underline-offset-4">
            Volver al catálogo
          </Link>
        </p>

        <Card>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-[var(--color-ink-soft)]">Código</dt>
              <dd className="font-mono">{concepto.code}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-ink-soft)]">Entidad que cobra</dt>
              <dd>{concepto.legalEntityShortName}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-ink-soft)]">Modo de cobro</dt>
              <dd>{concepto.billingMode === 'RECURRING' ? 'Recurrente' : 'Pago único'}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-ink-soft)]">Precio vigente hoy</dt>
              <dd className="tabular-nums">
                {vigente === null ? (
                  <span className="text-[var(--color-warning)]">Ninguno: todavía no se puede cobrar</span>
                ) : (
                  <>
                    {formatMoney(vigente.amountMinor, vigente.currency, formato)}
                    {vigente.interval !== null && (
                      <span className="text-[var(--color-ink-soft)]"> {PERIODICIDAD[vigente.interval]}</span>
                    )}
                  </>
                )}
              </dd>
            </div>
            {concepto.authorizingResolutionNote !== null && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-[var(--color-ink-soft)]">Acuerdo que la autoriza</dt>
                <dd>{concepto.authorizingResolutionNote}</dd>
              </div>
            )}
          </dl>
        </Card>

        {concepto.archivedAt !== null && (
          <Notice tone="warning" live="none" title="Este concepto está retirado del catálogo">
            Se retiró el {fecha.format(concepto.archivedAt)}. No se le puede poner precio nuevo mientras siga así, y no
            aparece donde se elige qué pagar. Sus cobros anteriores siguen donde estaban.
          </Notice>
        )}

        <Section title="Historia del precio" level={2}>
          {!historial.ok ? (
            <ErrorNotice title={historial.error.message} />
          ) : historial.data.length === 0 ? (
            <Notice tone="warning" live="none" title="Este concepto todavía no tiene precio">
              Hasta que tenga uno no se puede cobrar. Ni las cuotas ni las cantidades vienen puestas de fábrica: las
              acuerda la organización y se registran aquí.
            </Notice>
          ) : (
            <ScrollableTable caption="Versiones del precio, de la más reciente a la más antigua, con el periodo en que rigió cada una">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Versión</th>
                  <th scope="col" className="p-3 font-medium">Importe</th>
                  <th scope="col" className="p-3 font-medium">Rige desde</th>
                  <th scope="col" className="p-3 font-medium">Hasta</th>
                  <th scope="col" className="p-3 font-medium">En la pasarela</th>
                </tr>
              </thead>
              <tbody>
                {historial.data.map((precio) => (
                  <tr key={precio.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3 tabular-nums">
                      {precio.version}
                      {precio.effectiveTo === null && (
                        <span className="ml-2 inline-block align-middle">
                          <Badge tone="accent">Vigente</Badge>
                        </span>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatMoney(precio.amountMinor, precio.currency, formato)}
                      {precio.interval !== null && (
                        <span className="text-[var(--color-ink-soft)]"> {PERIODICIDAD[precio.interval]}</span>
                      )}
                    </td>
                    <td className="p-3 tabular-nums text-sm">{fecha.format(precio.effectiveFrom)}</td>
                    <td className="p-3 tabular-nums text-sm">
                      {precio.effectiveTo === null ? '—' : fecha.format(precio.effectiveTo)}
                    </td>
                    <td className="p-3 font-mono text-xs">{precio.stripePriceId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </Section>

        {concepto.archivedAt === null && (
          <Section
            title="Registrar una nueva versión del precio"
            level={2}
            description="El importe anterior no se edita: se cierra el día en que empieza el nuevo. Así un cobro de marzo sigue apuntando al precio de marzo."
          >
            <Card>
              <PriceForm productId={id} recurrente={concepto.billingMode === 'RECURRING'} hoy={hoy} />
            </Card>
          </Section>
        )}

        <Section
          title={concepto.archivedAt === null ? 'Retirar del catálogo' : 'Devolver al catálogo'}
          level={2}
          description={
            concepto.archivedAt === null
              ? 'Deja de ofrecerse y no se le pueden poner precios nuevos. Nada se borra.'
              : 'Vuelve a ofrecerse con el precio que tenía. Cambiarlo sigue exigiendo una versión nueva.'
          }
        >
          <Card>
            <LifecycleForm productId={id} archivado={concepto.archivedAt !== null} />
          </Card>
        </Section>
      </div>
    </PageShell>
  );
}
