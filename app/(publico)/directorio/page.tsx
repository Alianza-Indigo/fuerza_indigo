import Link from 'next/link';
import type { Metadata } from 'next';
import { EmptyState, PageShell, Prose, Section } from '@/design-system/primitives';
import { publicDirectory } from '@/modules/membership';

export const metadata: Metadata = {
  title: 'Directorio',
  description:
    'Personas de Fuerza Índigo que decidieron aparecer públicamente. Solo están quienes lo autorizaron.',
};

export const dynamic = 'force-dynamic';

/**
 * Directorio público (PRD §7.1, §7.3; F4-DIR-002).
 *
 * Se deriva **exclusivamente** de autorizaciones expresas. Nadie está aquí por
 * ser agremiado, por tener perfil profesional ni por haber pagado: está quien
 * dijo que sí, con lo que dijo que sí, y desaparece el día que lo retire.
 *
 * La página lo dice en voz alta, y no por modestia: quien la lee tiene que
 * entender que la ausencia de alguien **no significa** que no pertenezca a la
 * organización. Un directorio que se presenta como completo convierte cada
 * ausencia en una afirmación falsa sobre una persona.
 */
export default async function DirectorioPublicoPage() {
  const fichas = await publicDirectory();

  const texto = (ficha: (typeof fichas)[number], clave: string): string | null => {
    const valor = ficha.fields[clave];
    return typeof valor === 'string' && valor !== '' ? valor : null;
  };

  return (
    <PageShell
      title="Directorio"
      description="Quienes decidieron aparecer aquí. No están todas las personas de la organización: solo las que lo autorizaron."
    >
      <div className="space-y-8">
        <Prose>
          <p>
            Cada persona de este directorio eligió aparecer y eligió cuánto se ve de ella. Puede retirarlo
            cuando quiera, y entonces su ficha desaparece.
          </p>
          <p>
            Que alguien no esté aquí <strong>no dice nada</strong> sobre si pertenece a Fuerza Índigo. Dice
            que no quiso aparecer, que es una decisión suya y no un dato sobre ella.
          </p>
        </Prose>

        <Section title={`${fichas.length} ficha(s)`}>
          {fichas.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna ficha pública"
              description="Aparecerán aquí cuando alguien autorice su publicación."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {fichas.map((ficha) => (
                <li
                  key={ficha.slug}
                  className="rounded-lg border border-[var(--color-line)] p-4"
                >
                  <h2 className="font-semibold">
                    <Link href={`/directorio/${ficha.slug}`} className="underline underline-offset-4">
                      {texto(ficha, 'nombre') ?? 'Ficha'}
                    </Link>
                  </h2>
                  {texto(ficha, 'territorio') !== null && (
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{texto(ficha, 'territorio')}</p>
                  )}
                  {texto(ficha, 'titular') !== null && <p className="mt-2">{texto(ficha, 'titular')}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
