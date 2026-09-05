import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Notice,
  PageShell,
  Prose,
  Section,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { consentEntityOptions, consentVersionList } from '@/platform/consent';
import { DraftConsentForm, PublishConsentForm, RetireConsentForm } from './consent-forms';
import { ETIQUETA_DE_PROPOSITO } from './etiquetas';

export const metadata = { title: 'Avisos y consentimientos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ETIQUETA = ETIQUETA_DE_PROPOSITO;

/**
 * Avisos y textos de consentimiento (PRD §7.3, defecto `D-F4-001`).
 *
 * Esta pantalla existe porque faltaba. La semilla deja los avisos en borrador a
 * propósito —publicarlos es un acto de la organización, no de una migración— y
 * nada podía publicarlos: el formulario público de contacto exige un aviso
 * publicado antes de recabar un solo dato, así que en cualquier instalación real
 * se negaba a recibir mensajes, y lo hacía en silencio.
 */
export default async function ConsentimientosPage() {
  const actor = await currentActor();
  const [textos, opciones] = await Promise.all([consentVersionList(actor), consentEntityOptions(actor)]);

  if (!textos.ok) {
    return (
      <PageShell title="Avisos y consentimientos">
        <ErrorNotice title={textos.error.message} />
      </PageShell>
    );
  }

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const sinPublicar = textos.data.filter((texto) => texto.status === 'DRAFT');
  const publicados = textos.data.filter((texto) => texto.status === 'PUBLISHED');

  return (
    <PageShell
      title="Avisos y consentimientos"
      description="Los textos que la gente acepta. Un texto publicado no se edita: corregir una coma exige una versión nueva, porque quien firmó la anterior firmó la anterior."
    >
      <div className="space-y-8">
        {publicados.length === 0 && (
          <Notice tone="warning" title="No hay ningún texto publicado">
            <p>
              Mientras no publiques el aviso de privacidad de la entrada pública, el formulario público de
              contacto se niega a recabar datos y nadie puede escribirte por ahí.
            </p>
          </Notice>
        )}

        <Section title="Textos" description="Ordenados por código y versión, la más reciente primero.">
          {textos.data.length === 0 ? (
            <EmptyState title="Todavía no hay ningún texto" description="Redacta el primero abajo." />
          ) : (
            <ul className="space-y-4">
              {textos.data.map((texto) => (
                <li key={texto.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">
                          {texto.title}{' '}
                          <span className="font-normal text-[var(--color-ink-soft)]">v{texto.version}</span>
                        </h3>
                        <p className="font-mono text-xs text-[var(--color-ink-soft)]">
                          {texto.code} · {texto.legalEntity}
                        </p>
                      </div>
                      <Badge
                        tone={
                          texto.status === 'PUBLISHED' ? 'success' : texto.status === 'DRAFT' ? 'warning' : 'neutral'
                        }
                      >
                        {texto.status === 'PUBLISHED'
                          ? 'Publicado'
                          : texto.status === 'DRAFT'
                            ? 'Borrador'
                            : 'Retirado'}
                      </Badge>
                    </div>

                    <p className="mt-3 text-sm">
                      {texto.requiredFor.length === 0
                        ? 'Aviso informativo: no sirve para otorgar consentimiento.'
                        : `Sirve para consentir: ${texto.requiredFor.map((uno) => ETIQUETA.get(uno) ?? uno).join(', ')}.`}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {texto.status === 'PUBLISHED'
                        ? `Rige desde el ${fecha.format(texto.effectiveFrom)}.`
                        : texto.status === 'RETIRED'
                          ? `Retirado${texto.effectiveTo === null ? '' : ` el ${fecha.format(texto.effectiveTo)}`}.`
                          : 'Sin publicar: nadie puede aceptarlo todavía.'}
                      {texto.grantedConsents > 0 && ` ${texto.grantedConsents} consentimiento(s) lo citan.`}
                    </p>

                    <Disclosure summary="Leer el resumen en lenguaje claro">
                      <Prose>
                        <p className="whitespace-pre-wrap">{texto.plainLanguageSummary}</p>
                      </Prose>
                    </Disclosure>

                    {texto.status === 'DRAFT' && (
                      <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                        <PublishConsentForm consentVersionId={texto.id} />
                      </div>
                    )}
                    {texto.status === 'PUBLISHED' && (
                      <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                        <Disclosure summary="Retirar este texto">
                          <RetireConsentForm consentVersionId={texto.id} />
                        </Disclosure>
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {sinPublicar.length > 0 && (
          <Notice tone="neutral" title={`Hay ${sinPublicar.length} texto(s) sin publicar`}>
            <p>Un borrador no sirve para nada hasta que alguien con facultades lo publica.</p>
          </Notice>
        )}

        <Section title="Redactar un texto nuevo">
          {!opciones.ok ? (
            <ErrorNotice title={opciones.error.message} />
          ) : (
            <Card>
              <DraftConsentForm
                entidades={opciones.data.map((entidad) => ({ value: entidad.id, label: entidad.name }))}
              />
            </Card>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
