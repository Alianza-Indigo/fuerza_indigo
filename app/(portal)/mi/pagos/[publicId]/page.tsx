import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, Notice, PageShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { ownPayment } from '@/modules/billing';
import { formatMoney } from '@/platform/i18n';
import { ESTADO_DE_PAGO } from '../etiquetas';

export const metadata = { title: 'Detalle del cobro', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const MEDIO: Record<string, string> = {
  STRIPE_CHECKOUT: 'Pago en línea',
  STRIPE_SUBSCRIPTION: 'Cobro periódico en línea',
  MANUAL_TRANSFER: 'Transferencia registrada por la organización',
  MANUAL_CASH: 'Efectivo registrado por la organización',
  EXEMPTION: 'Exención',
};

/**
 * Un cobro, con su estado real.
 *
 * Es a donde vuelve la persona desde la pasarela, y por eso importa más lo que
 * **no** dice: no dice «pagado» por haber vuelto. El PRD §11.4 lo prohíbe con
 * todas sus letras —el retorno del navegador nunca es prueba de pago— y aquí
 * eso se traduce en un aviso honesto: el cobro se está confirmando, y quien
 * confirma es el webhook firmado.
 *
 * La alternativa, marcarlo como pagado al volver, es como se dan por buenos
 * cobros que el banco acabó rechazando.
 */
export default async function PagoPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ volviendo?: string }>;
}) {
  const actor = await currentActor();
  const { publicId } = await params;
  const { volviendo } = await searchParams;

  const pago = await ownPayment(actor, publicId);
  if (!pago.ok) notFound();

  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const fecha = new Intl.DateTimeFormat(actor.locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  const estado = ESTADO_DE_PAGO[pago.data.status];
  const enEspera = pago.data.status === 'REQUIRES_PAYMENT' || pago.data.status === 'PENDING';

  return (
    <PageShell title={pago.data.concept} description={`Cobro de ${pago.data.legalEntityShortName}`}>
      <div className="space-y-8">
        <p>
          <Link href="/mi/pagos" className="inline-flex min-h-11 items-center underline underline-offset-4">
            Volver a mis pagos
          </Link>
        </p>

        {volviendo === '1' && enEspera && (
          <Notice tone="accent" title="Estamos confirmando tu pago">
            Ya volviste de la pasarela, pero la confirmación viene del banco y puede tardar unos minutos. No hace falta
            que pagues otra vez ni que dejes esta página abierta: en cuanto llegue, el estado de aquí abajo cambia
            solo. Si algo saliera mal, te avisamos por correo.
          </Notice>
        )}

        {pago.data.status === 'FAILED' && (
          <Notice tone="danger" title="El cobro no salió" live="none">
            El banco no autorizó el cargo. No se te ha cobrado nada. Puedes intentarlo otra vez desde tus pagos, con
            la misma tarjeta o con otra.
          </Notice>
        )}

        <Card>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-[var(--color-ink-soft)]">Estado</dt>
              <dd className="mt-1">
                <Badge tone={estado.tone}>{estado.label}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-ink-soft)]">Importe</dt>
              <dd className="tabular-nums">{formatMoney(pago.data.amountMinor, pago.data.currency, formato)}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-ink-soft)]">Medio</dt>
              <dd>{MEDIO[pago.data.method] ?? pago.data.method}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-ink-soft)]">
                {pago.data.paidAt === null ? 'Se inició' : 'Se pagó'}
              </dt>
              <dd className="tabular-nums">{fecha.format(pago.data.paidAt ?? pago.data.createdAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-[var(--color-ink-soft)]">Referencia</dt>
              <dd className="font-mono text-sm">{pago.data.publicId}</dd>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                Es el dato que te vamos a pedir si nos escribes por este cobro.
              </p>
            </div>
          </dl>
        </Card>
      </div>
    </PageShell>
  );
}
