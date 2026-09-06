import type { Metadata } from 'next';
import { EcosystemCard, etiquetaDelModulo } from '@/design-system/ecosystem-card';
import { EmptyState, PageShell, Prose, Section } from '@/design-system/primitives';
import { catalogoPublicado } from '@/modules/ecosystem';

export const metadata: Metadata = {
  title: 'Plataformas y herramientas',
  description:
    'Las plataformas y herramientas del ecosistema Alianza Índigo: qué es cada una, a quién se dirige y cómo entrar.',
};

export const dynamic = 'force-dynamic';

/**
 * Catálogo público del ecosistema (PRD §12.4; F7-UI-001).
 *
 * Lo que esta página hace es **presentar y llevar**. Cada plataforma tiene su
 * propia cuenta, su propia operación, sus propios cobros y sus propios datos, y
 * nada de eso pasa por aquí: no hay inicio de sesión único, ni sincronización,
 * ni un dato de la persona viajando en la dirección.
 *
 * La página lo dice en voz alta y no por formalismo. Quien pulsa un acceso va a
 * encontrarse una pantalla de inicio de sesión distinta, y si cree que sigue
 * dentro de Fuerza Índigo va a pensar que algo se rompió —o peor, va a escribir
 * su contraseña de aquí allá—.
 *
 * Tampoco hay elegibilidad ni recomendaciones: el catálogo es igual para todo
 * el mundo y quien decide es la persona.
 */
export default async function HerramientasPage() {
  const fichas = await catalogoPublicado();

  return (
    <PageShell
      title="Plataformas y herramientas"
      description="Lo que ofrece el ecosistema Alianza Índigo, con qué es cada cosa y para quién."
    >
      <div className="space-y-8">
        <Prose>
          <p>
            Cada una de estas plataformas y herramientas <strong>funciona por su cuenta</strong>, con su
            propio acceso y sus propias reglas. Desde aquí te contamos qué son y te llevamos a ellas: al
            entrar sales de Fuerza Índigo.
          </p>
          <p>
            No hace falta ser agremiado ni tener sesión para verlas. Lo que necesite cada plataforma para
            entrar lo pide ella.
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
