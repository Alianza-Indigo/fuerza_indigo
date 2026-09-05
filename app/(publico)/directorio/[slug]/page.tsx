import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Card, PageShell, Prose, Section } from '@/design-system/primitives';
import { publicEntry } from '@/modules/membership';

export const dynamic = 'force-dynamic';

/**
 * Una ficha del directorio público (PRD §7.3; F4-DIR-002, F4-DIR-003).
 *
 * Dos cosas que esta página hace y conviene no perder de vista:
 *
 * 1. **Muestra solo lo que se guardó al publicar**, no lo que el perfil diga
 *    hoy. Lo publicado tiene que poder demostrarse tal como estuvo publicado.
 * 2. **La señal de no indexación sale de la ficha**, no de una lista aparte.
 *    Quien autorizó aparecer sin que la indexen recibe `noindex` en su propia
 *    página, y al retirar la autorización la página deja de existir: la
 *    dirección responde «no encontrado», que es lo que un buscador necesita
 *    para dejar de mostrarla.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ficha = await publicEntry(slug);
  if (ficha === null) return { title: 'Ficha no encontrada', robots: { index: false, follow: false } };

  const nombre = typeof ficha.fields['nombre'] === 'string' ? ficha.fields['nombre'] : 'Ficha';
  return {
    title: nombre,
    description: `Ficha pública de ${nombre} en el directorio de Fuerza Índigo.`,
    // La autorización de indexar es granular y revocable: cuando no está, esta
    // línea es lo que se lo dice al buscador.
    robots: ficha.indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function FichaPublicaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ficha = await publicEntry(slug);
  if (ficha === null) notFound();

  const texto = (clave: string): string | null => {
    const valor = ficha.fields[clave];
    return typeof valor === 'string' && valor !== '' ? valor : null;
  };
  const lista = (clave: string): string[] => {
    const valor = ficha.fields[clave];
    return Array.isArray(valor) ? valor.filter((uno): uno is string => typeof uno === 'string') : [];
  };

  const especialidades = lista('especialidades');
  const habilidades = lista('habilidadesVerificadas');
  const correo = texto('correoProfesional');
  const telefono = texto('telefonoProfesional');

  return (
    <PageShell title={texto('nombre') ?? 'Ficha'} description={texto('territorio') ?? undefined}>
      <div className="space-y-8">
        <p>
          <Link href="/directorio" className="underline underline-offset-4">
            ← Volver al directorio
          </Link>
        </p>

        {texto('titular') !== null && (
          <Section title="A qué se dedica">
            <Prose>
              <p>{texto('titular')}</p>
              {texto('resumen') !== null && <p>{texto('resumen')}</p>}
            </Prose>
          </Section>
        )}

        {especialidades.length > 0 && (
          <Section title="Especialidades">
            <ul className="list-disc pl-5">
              {especialidades.map((una) => (
                <li key={una}>{una}</li>
              ))}
            </ul>
          </Section>
        )}

        {habilidades.length > 0 && (
          <Section
            title="Habilidades verificadas"
            description="Verificadas por la organización. Lo que no está verificado no aparece."
          >
            <ul className="list-disc pl-5">
              {habilidades.map((una) => (
                <li key={una}>{una}</li>
              ))}
            </ul>
          </Section>
        )}

        {(correo !== null || telefono !== null) && (
          <Section
            title="Contacto profesional"
            description="Los medios que esta persona autorizó publicar. Nunca sus datos personales."
          >
            <Card>
              {correo !== null && (
                <p>
                  Correo: <a href={`mailto:${correo}`} className="underline underline-offset-4">{correo}</a>
                </p>
              )}
              {telefono !== null && <p className="mt-1">Teléfono: {telefono}</p>}
            </Card>
          </Section>
        )}

        <Prose>
          <p className="text-sm">
            Esta ficha está publicada porque la persona lo autorizó, y deja de estarlo el día que retire esa
            autorización.
          </p>
        </Prose>
      </div>
    </PageShell>
  );
}
