import {
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Notice,
  PageShell,
  Prose,
  Section,
} from '@/design-system/primitives';
import { Markdown } from '@/design-system/markdown';
import { currentActor } from '@/platform/http/request-context';
import { personConsents, publishedConsentTexts } from '@/platform/consent';
import { formatDate } from '@/platform/i18n/format';
import { ETIQUETA_DE_PROPOSITO } from '../../../gestion/consentimientos/etiquetas';
import { GrantForm, RevokeForm } from './consent-forms';

export const metadata = { title: 'Consentimientos y privacidad', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Lo que la persona autoriza y lo que retira (PRD §7.3, F4-UI-001).
 *
 * **Es la pantalla que a `D-F4-009` le faltaba.** Allí se repartieron las
 * facultades para consentir sobre lo propio y retirarlo, y no había ningún
 * sitio donde ejercerlas: una facultad sin pantalla es una promesa escrita en
 * el catálogo de permisos.
 *
 * La pantalla empieza por lo que ya está otorgado —que es la pregunta de quien
 * entra: «¿qué he autorizado?»— y solo después ofrece lo que se puede aceptar.
 * Al revés, la primera lectura sería una lista de cosas que firmar.
 *
 * **Lo retirado no desaparece.** Se queda con su fecha y su motivo, porque
 * retirar surte efecto hacia el futuro y no borra la evidencia de que en su
 * momento hubo base para tratar un dato.
 */
export default async function MisConsentimientosPage() {
  const actor = await currentActor();
  if (actor.personId === null) {
    return (
      <PageShell title="Consentimientos y privacidad">
        <ErrorNotice title="Para decidir sobre tus datos necesitas entrar con tu cuenta." />
      </PageShell>
    );
  }

  const [otorgados, textos] = await Promise.all([
    personConsents(actor, { personId: actor.personId }),
    publishedConsentTexts(actor),
  ]);

  if (!otorgados.ok) {
    return (
      <PageShell title="Consentimientos y privacidad">
        <ErrorNotice title={otorgados.error.message} />
      </PageShell>
    );
  }

  const vivos = otorgados.data.filter((uno) => uno.live);
  const retirados = otorgados.data.filter((uno) => !uno.live);
  const propositosVivos = new Set(vivos.map((uno) => uno.purpose));

  return (
    <PageShell
      title="Consentimientos y privacidad"
      description="Para qué autorizaste que la organización use tus datos, y cómo retirarlo cuando quieras."
    >
      <div className="space-y-8">
        <Section title="Lo que has autorizado">
          {vivos.length === 0 ? (
            <EmptyState
              title="No tienes ningún consentimiento vigente"
              description="Nada se trata sin tu autorización expresa. Abajo están los textos que puedes aceptar, con lo que dice cada uno."
            />
          ) : (
            <div className="space-y-4">
              {vivos.map((consentimiento) => (
                <Card key={consentimiento.id}>
                  <div className="space-y-3">
                    <div>
                      <p className="text-lg font-semibold">
                        {ETIQUETA_DE_PROPOSITO.get(consentimiento.purpose) ?? consentimiento.purpose}
                      </p>
                      <p className="text-sm text-[var(--color-ink-soft)]">
                        {consentimiento.text} · aceptado el {formatDate(consentimiento.grantedAt)}
                        {consentimiento.grantedByOwn ? '' : ' · registrado por la organización con tu sí'}
                      </p>
                      {consentimiento.expiresAt !== null && (
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          Vence el {formatDate(consentimiento.expiresAt)}.
                        </p>
                      )}
                    </div>
                    <Disclosure summary="Retirar este consentimiento">
                      <RevokeForm consentId={consentimiento.id} />
                    </Disclosure>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Lo que puedes aceptar"
          description="Cada texto se acepta para un propósito concreto. Un sí general no sustituye a uno específico."
        >
          {!textos.ok ? (
            <ErrorNotice title={textos.error.message} />
          ) : textos.data.length === 0 ? (
            <EmptyState
              title="No hay ningún texto publicado ahora mismo"
              description="Cuando la organización publique un aviso o un consentimiento, aparecerá aquí con su contenido completo."
            />
          ) : (
            <div className="space-y-4">
              {textos.data.map((texto) => {
                const propositos =
                  texto.purposes.length > 0
                    ? texto.purposes
                    : ([...ETIQUETA_DE_PROPOSITO.keys()] as typeof texto.purposes);
                const disponibles = propositos.filter((uno) => !propositosVivos.has(uno));

                return (
                  <Card key={texto.consentVersionId}>
                    <div className="space-y-3">
                      <div>
                        <p className="text-lg font-semibold">{texto.title}</p>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          {texto.legalEntity} · versión {texto.version} · en vigor desde{' '}
                          {formatDate(texto.effectiveFrom)}
                        </p>
                      </div>

                      <Disclosure summary="Leer el texto completo">
                        <Prose>
                          <Markdown source={texto.bodyMarkdown} headingOffset={3} />
                        </Prose>
                      </Disclosure>

                      {disponibles.length === 0 ? (
                        <Notice tone="success" title="Ya aceptaste este texto para todo lo que cubre" live="none">
                          <p>No queda nada que aceptar aquí. Puedes retirarlo arriba cuando quieras.</p>
                        </Notice>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {disponibles.map((proposito) => (
                            <GrantForm
                              key={`${texto.consentVersionId}:${proposito}`}
                              consentVersionId={texto.consentVersionId}
                              purpose={proposito}
                              etiqueta={ETIQUETA_DE_PROPOSITO.get(proposito) ?? proposito}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>

        {retirados.length > 0 && (
          <Section
            title="Lo que retiraste"
            description="Se queda escrito. Retirar surte efecto desde el momento en que lo hiciste y no borra lo que ya se había hecho con base en él."
          >
            <div className="space-y-3">
              {retirados.map((consentimiento) => (
                <Notice
                  key={consentimiento.id}
                  tone="neutral"
                  title={ETIQUETA_DE_PROPOSITO.get(consentimiento.purpose) ?? consentimiento.purpose}
                  live="none"
                >
                  <p>
                    Aceptado el {formatDate(consentimiento.grantedAt)}
                    {consentimiento.revokedAt === null
                      ? ''
                      : `, retirado el ${formatDate(consentimiento.revokedAt)}`}
                    .
                  </p>
                  {consentimiento.revokeReason !== null && <p>Motivo: {consentimiento.revokeReason}</p>}
                </Notice>
              ))}
            </div>
          </Section>
        )}

        <Prose>
          <h2>Qué significa retirar</h2>
          <p>
            Surte efecto <strong>hacia adelante</strong>: la organización deja de tratar tus datos para
            ese propósito desde ese momento. No borra lo que ya se hizo mientras el consentimiento
            estuvo vigente, porque eso dejaría a la organización sin poder demostrar que tuvo base para
            hacerlo.
          </p>
          <p>
            Si retiras el de publicación en el directorio, tu ficha pública desaparece en el acto. Eso se
            gestiona en <strong>Mi ficha pública</strong>.
          </p>
        </Prose>
      </div>
    </PageShell>
  );
}
