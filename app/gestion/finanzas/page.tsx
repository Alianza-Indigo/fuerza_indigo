import Link from 'next/link';
import { Badge, Card, EmptyState, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { db } from '@/platform/db/client';
import { can } from '@/platform/authz/policy';
import { formatMoney } from '@/platform/i18n';
import { ledgerEntries, pendingManualPayments, reconciliationList, refundQueue } from '@/modules/billing';

export const metadata = { title: 'Finanzas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Panel de finanzas (F3-UI-001).
 *
 * No es un tablero de indicadores: es una lista de lo que está esperando a
 * alguien. Un panel que enseña gráficas bonitas y esconde tres pagos sin
 * aprobar y dos eventos sin conciliar cumple su función estética y falla la
 * suya real, que es que nada se quede parado sin que nadie lo sepa.
 *
 * Por eso lo primero que se ve es lo pendiente, y solo después los totales.
 */
export default async function FinanzasPage() {
  const actor = await currentActor();
  const sondeo = { ...actor, reason: 'consulta del panel de finanzas' };

  const [manuales, devoluciones, cortes, libro] = await Promise.all([
    pendingManualPayments(actor),
    refundQueue(actor),
    reconciliationList(actor),
    ledgerEntries(actor, {}),
  ]);

  const entidades = actor.legalEntityScope;
  const alcance = entidades.length === 0 ? {} : { legalEntityId: { in: [...entidades] } };

  const [sinConciliar, cobrosPendientes] = await Promise.all([
    db().stripeWebhookEvent.count({
      where: { processingStatus: { in: ['UNRECONCILED', 'FAILED'] } },
    }),
    db().payment.count({ where: { ...alcance, status: 'REQUIRES_PAYMENT' } }),
  ]);

  const devolucionesPendientes = devoluciones.ok
    ? devoluciones.data.filter((fila) => fila.status === 'REQUESTED').length
    : 0;
  const manualesPendientes = manuales.ok ? manuales.data.length : 0;
  const cortesConDiferencias = cortes.ok
    ? cortes.data.filter((corte) => corte.status === 'WITH_DIFFERENCES').length
    : 0;

  const formato = { locale: actor.locale, timeZone: actor.timeZone };

  const secciones = [
    { href: '/gestion/finanzas/catalogo', label: 'Catálogo de cobros', permiso: 'billing.catalog.manage', descripcion: 'Qué se cobra y cuánto cuesta hoy.' },
    { href: '/gestion/finanzas/pagos', label: 'Pagos y devoluciones', permiso: 'billing.payment.read', descripcion: 'Lo recibido fuera de la plataforma y lo que hay que devolver.' },
    { href: '/gestion/finanzas/apoyos', label: 'Descuentos y becas', permiso: 'billing.discount.read', descripcion: 'Lo que la organización deja de cobrar, y por qué.' },
    { href: '/gestion/finanzas/libro', label: 'Libro y conciliación', permiso: 'billing.ledger.read', descripcion: 'Todo lo que entró y salió, con su origen.' },
    { href: '/gestion/finanzas/patrimonio', label: 'Patrimonio', permiso: 'billing.asset.read', descripcion: 'Lo que la organización tiene y quién autorizó cada cambio.' },
    { href: '/gestion/finanzas/rendicion', label: 'Rendición de cuentas', permiso: 'billing.accountability.read', descripcion: 'El semestre en totales, y la exportación del libro.' },
  ].filter((seccion) => can(sondeo, seccion.permiso, { kind: 'Gestion' }).allowed);

  const pendientes = [
    { cuantos: manualesPendientes, uno: 'pago manual esperando una segunda firma', varios: 'pagos manuales esperando una segunda firma', href: '/gestion/finanzas/pagos' },
    { cuantos: devolucionesPendientes, uno: 'devolución esperando aprobación', varios: 'devoluciones esperando aprobación', href: '/gestion/finanzas/pagos' },
    { cuantos: cortesConDiferencias, uno: 'corte con diferencias sin cerrar', varios: 'cortes con diferencias sin cerrar', href: '/gestion/finanzas/libro' },
    { cuantos: sinConciliar, uno: 'evento de la pasarela sin conciliar', varios: 'eventos de la pasarela sin conciliar', href: '/gestion/finanzas/libro' },
  ].filter((fila) => fila.cuantos > 0);

  return (
    <PageShell
      title="Finanzas"
      description="Lo que está esperando a alguien, primero. Los totales, después."
      width="ancha"
    >
      <div className="space-y-10">
        <Section title="Lo que espera" level={2}>
          {pendientes.length === 0 ? (
            <EmptyState
              title="No hay nada esperando"
              description="Ningún pago sin segunda firma, ninguna devolución sin resolver y ningún corte con diferencias abiertas."
            />
          ) : (
            <div className="space-y-3">
              {pendientes.map((fila) => (
                <Link
                  key={fila.uno}
                  href={fila.href}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] p-4 hover:bg-[var(--color-accent-soft)]"
                >
                  <Badge tone="warning">{fila.cuantos}</Badge>
                  <span className="font-medium">{fila.cuantos === 1 ? fila.uno : fila.varios}</span>
                </Link>
              ))}
            </div>
          )}

          {cobrosPendientes > 0 && (
            <Notice tone="neutral" live="none" title={`${String(cobrosPendientes)} cobros sin completar`}>
              Son personas que abrieron una página de pago y no terminaron. No hace falta hacer nada con ellos: se
              quedan así hasta que la persona vuelva o abandone. No cuentan como ingreso.
            </Notice>
          )}
        </Section>

        {libro.ok && (
          <Section title="El libro, hasta hoy" level={2}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Entró</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-success)]">
                  {formatMoney(libro.data.totals.creditMinor, 'MXN', formato)}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Salió</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-danger)]">
                  {formatMoney(libro.data.totals.debitMinor, 'MXN', formato)}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Neto</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatMoney(libro.data.totals.netMinor, 'MXN', formato)}
                </p>
              </Card>
            </div>
          </Section>
        )}

        <Section title="Secciones" level={2}>
          <div className="grid gap-4 sm:grid-cols-2">
            {secciones.map((seccion) => (
              <Link
                key={seccion.href}
                href={seccion.href}
                className="rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] p-4 hover:bg-[var(--color-accent-soft)]"
              >
                <span className="block font-semibold underline underline-offset-4">{seccion.label}</span>
                <span className="mt-1 block text-sm text-[var(--color-ink-soft)]">{seccion.descripcion}</span>
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </PageShell>
  );
}
