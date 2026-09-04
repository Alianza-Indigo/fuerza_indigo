import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Notice, PageShell, Prose, Section } from '@/design-system/primitives';
import { RequestForm } from './request-form';

export const metadata: Metadata = {
  title: 'Contacto',
  description: 'Escríbele a Fuerza Índigo o a Alianza Índigo. Te damos un folio y una persona te contesta.',
  robots: { index: true, follow: true },
};

/**
 * Contacto general (F2-UI-010).
 *
 * Comparte formulario con «Solicitar apoyo» porque es el mismo acto —alguien
 * escribe desde fuera— y separarlos en dos implementaciones haría que una de
 * las dos se quedara atrás. Lo que cambia es qué asuntos se ofrecen y cómo se
 * presenta la página.
 */
export default function ContactoPage() {
  return (
    <PageShell
      title="Contacto"
      description="Escríbenos y te contestamos. No necesitas cuenta ni saber a qué área dirigirte."
      width="lectura"
    >
      <div className="space-y-10">
        <Notice title="Esto no es un canal de urgencias" tone="warning" live="none">
          <p>
            No está atendido las veinticuatro horas. Si estás en peligro ahora mismo, llama al <strong>911</strong>:
            funciona en todo México y no cuesta nada.
          </p>
        </Notice>

        <Section title="¿Buscas ayuda con una situación concreta?" level={2}>
          <Prose>
            <p>
              Si lo tuyo es un problema en el trabajo, una discriminación, una barrera de accesibilidad o cualquier
              cosa en la que necesites acompañamiento, empieza en{' '}
              <Link href="/solicitar-apoyo" className="underline underline-offset-4">
                Solicitar apoyo
              </Link>
              : el formulario de ahí pregunta lo que hace falta para canalizarte.
            </p>
          </Prose>
        </Section>

        <Card>
          <RequestForm modo="contacto" />
        </Card>
      </div>
    </PageShell>
  );
}
