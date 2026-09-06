import type { Metadata } from 'next';
import { EcosystemCard, etiquetaDelModulo } from '@/design-system/ecosystem-card';
import { EmptyState, PageShell, Prose, Section } from '@/design-system/primitives';
import { catalogoPublicado } from '@/modules/ecosystem';

export const metadata: Metadata = {
  title: 'Plataformas y herramientas',
};

export const dynamic = 'force-dynamic';

/**
 * El mismo catálogo, dentro del portal (PRD §12.4; F7-UI-001).
 *
 * Son **las mismas fichas**, leídas de la misma consulta y pintadas con el
 * mismo componente. No hay una versión «para personas afiliadas» con más cosas:
 * el PRD es explícito en que no hay elegibilidad ni derechos de acceso, y una
 * lista distinta aquí insinuaría que tener cuenta desbloquea algo, que es justo
 * lo que este catálogo no hace.
 *
 * Está en el portal porque quien entra a ver su afiliación o sus pagos no
 * debería tener que volver al sitio público para encontrar una herramienta.
 */
export default async function HerramientasDelPortalPage() {
  const fichas = await catalogoPublicado();

  return (
    <PageShell
      title="Plataformas y herramientas"
      description="Lo que ofrece el ecosistema. Cada una funciona por su cuenta y con su propio acceso."
    >
      <div className="space-y-8">
        <Prose>
          <p>
            Tu cuenta de Fuerza Índigo <strong>no entra</strong> en estas plataformas: cada una tiene la
            suya. Al pulsar un acceso sales de aquí.
          </p>
        </Prose>

        <Section title={`${fichas.length} en el catálogo`}>
          {fichas.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna plataforma publicada"
              description="Aparecerán aquí cuando la organización las publique en el catálogo."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {fichas.map((ficha) => (
                <li key={ficha.code}>
                  <EcosystemCard ficha={ficha} etiqueta={etiquetaDelModulo(ficha.modulo)} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
