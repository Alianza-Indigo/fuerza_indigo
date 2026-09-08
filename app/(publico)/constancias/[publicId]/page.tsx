import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, Notice, PageShell, Prose, Section } from '@/design-system/primitives';
import { verifyConstancy } from '@/modules/events';
import { formatDate } from '@/platform/i18n/format';

/**
 * Resultado de la verificación de una constancia (PRD §16.3, Fase 9 criterio 5).
 *
 * **Se lee en vivo, siempre.** Nada se cachea: una constancia revocada hace un
 * minuto tiene que aparecer revocada ahora. Por eso `force-dynamic` y
 * `robots: noindex`.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resultado de la verificación',
  robots: { index: false, follow: false },
};

export default async function ConstanciaPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const resultado = await verifyConstancy(decodeURIComponent(publicId));

  if (!resultado.ok) {
    return (
      <PageShell title="No encontramos esa constancia">
        <div className="space-y-8">
          <Notice tone="danger" title="Ese código no corresponde a ninguna constancia">
            <p>
              Puede ser una errata al teclearlo, un código de otra organización, o una constancia que
              nunca existió. Comprueba el código impreso y vuelve a intentarlo.
            </p>
          </Notice>
          <p>
            <Link href="/constancias" className="underline underline-offset-4">
              Probar con otro código
            </Link>
          </p>
        </div>
      </PageShell>
    );
  }

  const c = resultado.data;

  return (
    <PageShell title="Resultado de la verificación">
      <div className="space-y-8">
        {c.revoked ? (
          <Notice tone="danger" title="Esta constancia fue revocada">
            <p>
              {c.revokedAt === null
                ? 'La organización la dio por revocada y ya no la reconoce como válida.'
                : `La organización la revocó el ${formatDate(c.revokedAt)} y ya no la reconoce como válida.`}
            </p>
          </Notice>
        ) : (
          <Notice tone="success" title="Constancia auténtica y vigente">
            <p>Esta constancia fue emitida por la organización y sigue reconociéndose como válida.</p>
          </Notice>
        )}

        <Section title="Lo que acredita">
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Evento</dt>
                <dd className="text-lg font-semibold">{c.eventTitle}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">A nombre de</dt>
                <dd className="text-lg font-semibold">{c.participantName}</dd>
              </div>
              {c.folio !== null && (
                <div>
                  <dt className="text-sm text-[var(--color-ink-soft)]">Folio</dt>
                  <dd className="font-mono">{c.folio}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Emitida</dt>
                <dd>{formatDate(c.issuedAt)}</dd>
              </div>
            </dl>
          </Card>
        </Section>

        <Prose>
          <p>
            Esta pantalla muestra el estado de la constancia <strong>en este momento</strong>. No es una
            copia guardada: si la organización la revoca, cambia aquí en el acto.
          </p>
        </Prose>

        <p>
          <Link href="/constancias" className="underline underline-offset-4">
            Verificar otra constancia
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
