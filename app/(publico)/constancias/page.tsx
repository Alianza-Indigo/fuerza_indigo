import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Field, PageShell, Prose, Section, SubmitButton } from '@/design-system/primitives';

export const metadata: Metadata = {
  title: 'Verificar una constancia',
  description:
    'Comprueba si una constancia de participación de Fuerza Índigo es auténtica y sigue vigente. Teclea el código impreso.',
};

/**
 * Entrada del verificador público de constancias (PRD §16.3, Fase 9 criterio 5).
 *
 * Igual que el verificador de credenciales: quien tiene el enlace impreso llega
 * directo al resultado; esta pantalla es para quien teclea el código a mano. El
 * formulario envía por `GET`, sin acción de servidor ni JavaScript, porque
 * verificar no cambia nada y así funciona en cualquier navegador.
 */
export default async function ConstanciasPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;
  const limpio = (codigo ?? '').trim().replace(/\s+/g, '');
  if (limpio !== '') redirect(`/constancias/${encodeURIComponent(limpio)}`);

  return (
    <PageShell
      title="Verificar una constancia"
      description="Comprueba si una constancia de participación es auténtica y sigue vigente en este momento."
    >
      <div className="space-y-8">
        <Section title="Escribe el código de la constancia">
          <Card>
            <form action="/constancias" method="get" className="space-y-4">
              <Field
                name="codigo"
                label="Código de la constancia"
                required
                hint="Está impreso en la constancia. Los espacios dan igual."
                autoComplete="off"
              />
              <SubmitButton>Verificar</SubmitButton>
            </form>
          </Card>
        </Section>

        <Prose>
          <h2>Qué vas a ver</h2>
          <p>
            Qué evento certifica la constancia, a nombre de quién, cuándo se emitió y si sigue vigente.
            Nada más: es lo necesario para saber si el documento vale.
          </p>
          <p>
            El estado se lee <strong>en este momento</strong>. Una constancia revocada aparece revocada
            aquí en el acto, no cuando expire una copia guardada.
          </p>
        </Prose>
      </div>
    </PageShell>
  );
}
