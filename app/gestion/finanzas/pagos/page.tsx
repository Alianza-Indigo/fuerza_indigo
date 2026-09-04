import { Badge, Card, EmptyState, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { pendingManualPayments, refundQueue } from '@/modules/billing';
import { db } from '@/platform/db/client';
import { can } from '@/platform/authz/policy';
import { formatMoney } from '@/platform/i18n';
import { RegisterManualPaymentForm, RequestRefundForm, ResolveManualPaymentForm, ResolveRefundForm } from './forms';

export const metadata = { title: 'Pagos y devoluciones', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const MEDIO: Record<string, string> = {
  MANUAL_TRANSFER: 'Transferencia',
  MANUAL_CASH: 'Efectivo',
};

const ESTADO_DEVOLUCION: Record<string, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  REQUESTED: { label: 'Esperando aprobación', tone: 'warning' },
  APPROVED: { label: 'Aprobada', tone: 'accent' },
  PROCESSING: { label: 'En proceso', tone: 'accent' },
  SUCCEEDED: { label: 'Devuelta', tone: 'success' },
  FAILED: { label: 'Falló al ejecutarse', tone: 'danger' },
  REJECTED: { label: 'Rechazada', tone: 'neutral' },
};

/**
 * Pagos manuales y devoluciones (F3-PAG-009, F3-PAG-010).
 *
 * La pantalla enseña el doble control en vez de esconderlo: a quien registró un
 * pago no se le ofrece aprobarlo, y se le dice por qué. Ocultar el botón sin
 * explicación haría pensar que falta un permiso; decirlo enseña cómo funciona
 * el control.
 */
export default async function PagosPage() {
  const actor = await currentActor();

  const [manuales, devoluciones] = await Promise.all([pendingManualPayments(actor), refundQueue(actor)]);

  const puedeRegistrar = can(
    { ...actor, reason: 'consulta de la pantalla de pagos' },
    'billing.payment.register_manual',
    { kind: 'Payment' },
  ).allowed;
  const puedeAprobar = can(
    { ...actor, reason: 'consulta de la pantalla de pagos' },
    'billing.payment.approve_manual',
    { kind: 'Payment' },
  ).allowed;
  const puedePedirDevolucion = can(
    { ...actor, reason: 'consulta de la pantalla de pagos' },
    'billing.refund.request',
    { kind: 'Refund' },
  ).allowed;
  const puedeResolverDevolucion = can(
    { ...actor, reason: 'consulta de la pantalla de pagos' },
    'billing.refund.approve',
    { kind: 'Refund' },
  ).allowed;

  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const fecha = new Intl.DateTimeFormat(actor.locale, { dateStyle: 'medium', timeZone: actor.timeZone });

  // Las cuentas de cobro que ya existen, para no pedir un identificador a mano.
  const cuentas = puedeRegistrar
    ? await db().billingAccount.findMany({
        where:
          actor.legalEntityScope.length === 0
            ? { status: 'ACTIVE' }
            : { status: 'ACTIVE', legalEntityId: { in: [...actor.legalEntityScope] } },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          person: { select: { givenName: true, familyName: true } },
          organization: { select: { legalName: true } },
          legalEntity: { select: { shortName: true } },
        },
      })
    : [];

  return (
    <PageShell
      title="Pagos y devoluciones"
      description="Lo que se recibió fuera de la plataforma y lo que hay que devolver. Ninguna de las dos cosas la resuelve una sola persona."
      width="ancha"
    >
      <div className="space-y-10">
        <Section
          title="Pagos recibidos fuera de la plataforma"
          level={2}
          description="Esperan una segunda firma. Hasta que alguien más los apruebe, el dinero no cuenta."
        >
          {!manuales.ok ? (
            <ErrorNotice title={manuales.error.message} />
          ) : manuales.data.length === 0 ? (
            <EmptyState
              title="No hay ningún pago esperando aprobación"
              description="Cuando se registre una transferencia o un efectivo, aparecerá aquí para que otra persona lo confirme."
            />
          ) : (
            <div className="space-y-4">
              {manuales.data.map((fila) => (
                <Card key={fila.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{fila.holder}</h3>
                      <p className="text-sm text-[var(--color-ink-soft)]">
                        {fila.legalEntityShortName} · {MEDIO[fila.method] ?? fila.method} ·{' '}
                        {fecha.format(fila.registeredAt)}
                      </p>
                      <p className="mt-1 text-sm">
                        Registrado por {fila.registeredBy} · referencia{' '}
                        <span className="font-mono text-xs">{fila.publicId}</span>
                      </p>
                    </div>
                    <p className="text-xl font-semibold tabular-nums">
                      {formatMoney(fila.amountMinor, fila.currency, formato)}
                    </p>
                  </div>

                  <div className="mt-4">
                    {!puedeAprobar ? (
                      <p className="text-sm text-[var(--color-ink-soft)]">
                        Aprobarlo le corresponde a la Secretaría Ejecutiva.
                      </p>
                    ) : fila.registeredByMe ? (
                      <Notice tone="neutral" live="none" title="Este lo registraste tú">
                        Tiene que aprobarlo otra persona. No es una restricción de tu nombramiento: es el doble
                        control que impide que una sola persona declare pagado lo que nadie pagó.
                      </Notice>
                    ) : (
                      <ResolveManualPaymentForm paymentId={fila.id} />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>

        {puedeRegistrar && (
          <Section title="Registrar un pago recibido" level={2}>
            <Card>
              <RegisterManualPaymentForm
                cuentas={cuentas.map((cuenta) => ({
                  id: cuenta.id,
                  label: `${
                    cuenta.person === null
                      ? (cuenta.organization?.legalName ?? 'Sin titular')
                      : `${cuenta.person.givenName} ${cuenta.person.familyName}`
                  } — ${cuenta.legalEntity.shortName}`,
                }))}
              />
            </Card>
          </Section>
        )}

        <Section title="Devoluciones" level={2}>
          {!devoluciones.ok ? (
            <ErrorNotice title={devoluciones.error.message} />
          ) : devoluciones.data.length === 0 ? (
            <EmptyState
              title="No hay ninguna devolución"
              description="Cuando se pida una, aparecerá aquí para que otra persona la apruebe o la rechace."
            />
          ) : (
            <div className="space-y-4">
              {devoluciones.data.map((fila) => {
                const estado = ESTADO_DEVOLUCION[fila.status] ?? { label: fila.status, tone: 'neutral' as const };
                return (
                  <Card key={fila.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">{fila.holder}</h3>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          Cobro <span className="font-mono text-xs">{fila.paymentPublicId}</span> · pedida por{' '}
                          {fila.requestedBy} el {fecha.format(fila.requestedAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-semibold tabular-nums">
                          {formatMoney(fila.amountMinor, fila.currency, formato)}
                        </p>
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                      </div>
                    </div>

                    <p className="mt-3 max-w-[var(--width-prose)]">{fila.reason}</p>

                    {fila.status === 'REQUESTED' && (
                      <div className="mt-4">
                        {!puedeResolverDevolucion ? (
                          <p className="text-sm text-[var(--color-ink-soft)]">
                            Aprobarla le corresponde a la Secretaría Ejecutiva.
                          </p>
                        ) : fila.requestedByMe ? (
                          <Notice tone="neutral" live="none" title="Esta la pediste tú">
                            Tiene que aprobarla otra persona. Es el mismo doble control que en los pagos: quien pide
                            no aprueba.
                          </Notice>
                        ) : (
                          <ResolveRefundForm refundId={fila.id} />
                        )}
                      </div>
                    )}

                    {fila.status === 'FAILED' && (
                      <Notice tone="danger" live="none" title="La aprobación consta, pero el dinero no salió">
                        La pasarela rechazó la ejecución. La devolución sigue aprobada y se puede volver a intentar.
                      </Notice>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </Section>

        {puedePedirDevolucion && (
          <Section
            title="Solicitar una devolución"
            level={2}
            description="La aprueba otra persona. Al aprobarse, el dinero sale."
          >
            <Card>
              <RequestRefundForm />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
