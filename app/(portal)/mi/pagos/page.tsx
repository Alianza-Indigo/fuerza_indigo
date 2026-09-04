import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, Notice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { ownPayments, ownSubscriptions, payableCatalog } from '@/modules/billing';
import { formatMoney } from '@/platform/i18n';
import { ESTADO_DE_PAGO, ESTADO_DE_SUSCRIPCION, PERIODICIDAD } from './etiquetas';
import { PayButton, PortalButton } from './pay-form';

export const metadata = { title: 'Mis pagos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Los pagos de la persona (PRD §11.3, F3-UI-001).
 *
 * Tres cosas y en este orden: lo que tiene abierto, lo que ya pagó y lo que
 * puede pagar. Primero el estado de lo suyo, porque quien entra aquí casi
 * siempre viene a comprobar si un cobro salió, y después la oferta.
 */
export default async function MisPagosPage({
  searchParams,
}: {
  searchParams: Promise<{ cobro?: string }>;
}) {
  const actor = await currentActor();
  const { cobro } = await searchParams;

  const [pagos, suscripciones, disponibles] = await Promise.all([
    ownPayments(actor),
    ownSubscriptions(actor),
    payableCatalog(actor),
  ]);

  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const fecha = new Intl.DateTimeFormat(actor.locale, { dateStyle: 'medium', timeZone: actor.timeZone });

  // Una entidad por cada suscripción viva: es donde tiene sentido ofrecer el
  // portal, porque es donde hay una tarjeta guardada que cambiar.
  const entidadesConPortal = suscripciones.ok
    ? [...new Map(suscripciones.data.map((s) => [s.legalEntityId, s.legalEntityShortName])).entries()]
    : [];

  return (
    <PageShell
      title="Mis pagos"
      description="Lo que has pagado, lo que tienes en curso y lo que puedes pagar."
      width="ancha"
    >
      <div className="space-y-10">
        {cobro === 'cancelado' && (
          <Notice tone="neutral" title="No se completó el pago">
            Volviste sin terminar. No se te ha cobrado nada y puedes intentarlo otra vez cuando quieras.
          </Notice>
        )}

        {suscripciones.ok && suscripciones.data.length > 0 && (
          <Section title="Lo que pagas periódicamente" level={2}>
            <div className="space-y-4">
              {suscripciones.data.map((fila) => (
                <Card key={fila.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{fila.concept}</h3>
                      <p className="text-sm text-[var(--color-ink-soft)]">{fila.legalEntityShortName}</p>
                      <p className="mt-2 tabular-nums">
                        {formatMoney(fila.amountMinor, fila.currency, formato)}
                        {fila.interval !== null && (
                          <span className="text-[var(--color-ink-soft)]"> {PERIODICIDAD[fila.interval]}</span>
                        )}
                      </p>
                    </div>
                    <Badge tone={ESTADO_DE_SUSCRIPCION[fila.status].tone}>
                      {ESTADO_DE_SUSCRIPCION[fila.status].label}
                    </Badge>
                  </div>

                  <p className="mt-3 text-sm">
                    {fila.cancelAtPeriodEnd
                      ? `Termina el ${fecha.format(fila.currentPeriodEnd)} y no se renueva.`
                      : `Se renueva el ${fecha.format(fila.currentPeriodEnd)}.`}
                  </p>

                  {fila.gracePeriodEndsAt !== null && (
                    <p className="mt-2 text-sm font-medium text-[var(--color-warning)]">
                      Hubo un problema con el cobro. Tienes hasta el {fecha.format(fila.gracePeriodEndsAt)} para
                      resolverlo sin perder nada.
                    </p>
                  )}
                  {fila.gracePeriodEndsAt === null && fila.gracePeriodDays > 0 && (
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                      Si un cobro falla, tienes {fila.gracePeriodDays}{' '}
                      {fila.gracePeriodDays === 1 ? 'día' : 'días'} para resolverlo sin perder nada.
                    </p>
                  )}
                </Card>
              ))}
            </div>

            {entidadesConPortal.length > 0 && (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-[var(--color-ink-soft)]">
                  Para cambiar tu tarjeta, descargar recibos o cancelar, entra a la administración de pagos. Se abre
                  en la pasarela, que es donde viven los datos de tu tarjeta: esta plataforma no los guarda ni los ve.
                </p>
                {entidadesConPortal.map(([id, nombre]) => (
                  <PortalButton key={id} legalEntityId={id} label={`Administrar mis pagos de ${nombre}`} />
                ))}
              </div>
            )}
          </Section>
        )}

        <Section title="Historial" level={2}>
          {!pagos.ok ? (
            <ErrorNotice title={pagos.error.message} />
          ) : pagos.data.length === 0 ? (
            <EmptyState
              title="Todavía no tienes ningún cobro"
              description="Cuando pagues algo, aparecerá aquí con su estado y su fecha."
            />
          ) : (
            <ScrollableTable caption="Tus cobros, del más reciente al más antiguo">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Concepto</th>
                  <th scope="col" className="p-3 font-medium">Entidad</th>
                  <th scope="col" className="p-3 font-medium">Importe</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {pagos.data.map((fila) => (
                  <tr key={fila.publicId} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      <Link href={`/mi/pagos/${fila.publicId}`} className="font-medium underline underline-offset-4">
                        {fila.concept}
                      </Link>
                    </td>
                    <td className="p-3">{fila.legalEntityShortName}</td>
                    <td className="p-3 tabular-nums">{formatMoney(fila.amountMinor, fila.currency, formato)}</td>
                    <td className="p-3">
                      <Badge tone={ESTADO_DE_PAGO[fila.status].tone}>{ESTADO_DE_PAGO[fila.status].label}</Badge>
                    </td>
                    <td className="p-3 tabular-nums text-sm">
                      {fecha.format(fila.paidAt ?? fila.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </Section>

        <Section title="Lo que puedes pagar" level={2}>
          {!disponibles.ok ? (
            <ErrorNotice title={disponibles.error.message} />
          ) : disponibles.data.length === 0 ? (
            <EmptyState
              title="Ahora mismo no hay nada que puedas pagar aquí"
              description="No es un error ni una espera: la organización todavía no ha puesto ningún concepto a tu alcance. Si crees que deberías poder pagar algo, escríbenos."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {disponibles.data.map((fila) => (
                <Card key={fila.productId}>
                  <h3 className="text-lg font-semibold">{fila.name}</h3>
                  <p className="text-sm text-[var(--color-ink-soft)]">{fila.legalEntityShortName}</p>
                  <p className="mt-2">{fila.description}</p>
                  <p className="mt-3 text-xl font-semibold tabular-nums">
                    {formatMoney(fila.amountMinor, fila.currency, formato)}
                    {fila.interval !== null && (
                      <span className="text-base font-normal text-[var(--color-ink-soft)]">
                        {' '}
                        {PERIODICIDAD[fila.interval]}
                      </span>
                    )}
                  </p>
                  <div className="mt-4">
                    <PayButton
                      productId={fila.productId}
                      label={fila.billingMode === 'RECURRING' ? 'Suscribirme' : 'Pagar'}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
