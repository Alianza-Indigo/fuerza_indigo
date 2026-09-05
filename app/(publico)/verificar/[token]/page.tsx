import Link from 'next/link';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { Card, Notice, PageShell, Prose, Section } from '@/design-system/primitives';
import { verifyCredential } from '@/modules/membership';
import { requestContext } from '@/platform/http/request-context';
import { formatDate } from '@/platform/i18n/format';
import { codigoLegible } from '@/platform/credentials/design';
import { ETIQUETA_DE_ESTADO, ETIQUETA_DE_TIPO } from '../etiquetas';

/**
 * Resultado de la verificación (PRD §7.4, F4-CRE-003).
 *
 * **Se lee en vivo, siempre.** Nada de esta página se cachea: una credencial
 * revocada hace un minuto tiene que aparecer revocada ahora, y una respuesta
 * guardada convertiría «efecto inmediato» en «efecto cuando expire la caché».
 * Por eso `force-dynamic` y `robots: noindex`: tampoco tiene sentido que un
 * buscador guarde el estado de una credencial de hace tres semanas.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resultado de la verificación',
  robots: { index: false, follow: false },
};

export default async function VerificarTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contexto = await requestContext();
  const cabeceras = await headers();

  const resultado = await verifyCredential(decodeURIComponent(token), {
    // Lo que la red de entrega declara del país, y nada más fino. Es lo único
    // que se guarda del origen: ni dirección, ni sesión, ni identificador.
    countryCodeHint: cabeceras.get('x-vercel-ip-country'),
    userAgentClass: contexto.userAgentClass,
  });

  if (!resultado.found) {
    return (
      <PageShell title="No encontramos esa credencial">
        <div className="space-y-8">
          <Notice tone="danger" title="Ese código no corresponde a ninguna credencial">
            <p>
              Puede ser una errata al teclearlo, un código de otra organización, o una credencial que
              nunca existió. Comprueba el código impreso y vuelve a intentarlo.
            </p>
          </Notice>
          <p>
            <Link href="/verificar" className="underline underline-offset-4">
              Probar con otro código
            </Link>
          </p>
        </div>
      </PageShell>
    );
  }

  const estado = ETIQUETA_DE_ESTADO[resultado.status!];

  return (
    <PageShell title="Resultado de la verificación">
      <div className="space-y-8">
        <Notice tone={estado.tono} title={estado.titulo}>
          <p>{estado.explicacion}</p>
        </Notice>

        <Section title="Lo que acredita">
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Nombre</dt>
                <dd className="text-lg font-semibold">{resultado.displayName}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Tipo de credencial</dt>
                <dd className="text-lg font-semibold">{ETIQUETA_DE_TIPO[resultado.kind!]}</dd>
              </div>
              {resultado.territoryLabel !== null && (
                <div>
                  <dt className="text-sm text-[var(--color-ink-soft)]">Territorio o cargo</dt>
                  <dd>{resultado.territoryLabel}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Vigencia</dt>
                <dd>
                  {resultado.expiresAt === null
                    ? 'Sin fecha de término'
                    : `Hasta el ${formatDate(resultado.expiresAt)}`}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Emitida</dt>
                <dd>{formatDate(resultado.issuedAt!)}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Número de verificación</dt>
                <dd className="font-mono">{codigoLegible(resultado.publicCode!)}</dd>
              </div>
            </dl>
          </Card>
        </Section>

        <Prose>
          <p>
            Esta pantalla muestra el estado de la credencial <strong>en este momento</strong>. No es una
            copia guardada: si algo cambia, cambia aquí en el acto.
          </p>
          <p>
            Solo se muestra lo necesario para saber si el documento vale. No verás datos de contacto ni
            el número de miembro de la persona.
          </p>
        </Prose>

        <p>
          <Link href="/verificar" className="underline underline-offset-4">
            Verificar otra credencial
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
