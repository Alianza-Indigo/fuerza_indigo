import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, PageShell, Prose, Section } from '@/design-system/primitives';
import { currentPreferences } from '@/platform/preferences';
import { PreferencesForm } from './preferences-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cómo se ve este sitio',
  description:
    'Ajusta el tamaño del texto, el espacio, el movimiento y el tema. Tus preferencias se guardan y se aplican en todo el sitio.',
  robots: { index: true, follow: true },
};

/**
 * Centro de accesibilidad (F2-UI-012, PRD §5.3).
 *
 * No es una declaración de intenciones: es el lugar donde se cambian las cosas.
 * La declaración formal vive en `/legales/accesibilidad`; aquí se ajusta y se ve
 * el efecto de inmediato, sin recargar ni buscar en ninguna otra parte.
 *
 * Está enlazado desde el pie de todas las páginas. Un centro de accesibilidad al
 * que solo se llega sabiendo su dirección no sirve a quien lo necesita.
 */
export default async function AccesibilidadPage() {
  const preferencias = await currentPreferences();

  return (
    <PageShell
      title="Cómo se ve este sitio"
      description="Ajusta lo que necesites. Se guarda y se aplica en todas las páginas, también la próxima vez que vuelvas."
      width="lectura"
    >
      <div className="space-y-10">
        <Card>
          <PreferencesForm valores={preferencias} />
        </Card>

        <Section title="Lo que ya hacemos sin que tengas que pedirlo" level={2}>
          <Prose>
            <ul className="list-disc space-y-2 pl-6 marker:text-[var(--color-accent)]">
              <li>
                Si tu sistema pide reducir el movimiento, lo respetamos aunque no toques nada aquí.
              </li>
              <li>
                Si tu sistema está en tema oscuro, el sitio también. Los dos temas están medidos para que el texto se
                lea con holgura.
              </li>
              <li>Puedes ampliar con el navegador hasta el 200 % sin que se pierda contenido ni funciones.</li>
              <li>
                Todo se puede usar con el teclado, y el elemento que tiene el foco se ve siempre.
              </li>
              <li>Los campos de los formularios tienen etiqueta visible y los errores salen junto al campo.</li>
              <li>Nada parpadea ni se reproduce solo.</li>
            </ul>
          </Prose>
        </Section>

        <Section title="Si encuentras una barrera" level={2}>
          <Prose>
            <p>
              Queremos saberlo. Cuéntanos qué intentabas hacer, con qué dispositivo y qué pasó. No hace falta que uses
              términos técnicos: «no pude enviar el formulario desde el teléfono» es una descripción perfecta.
            </p>
            <p>
              <Link href="/contacto" className="font-medium underline underline-offset-4">
                Escríbenos por el formulario de contacto
              </Link>{' '}
              o consulta la{' '}
              <Link href="/legales/accesibilidad" className="font-medium underline underline-offset-4">
                declaración de accesibilidad
              </Link>
              , donde está el compromiso formal y los plazos de respuesta.
            </p>
          </Prose>
        </Section>
      </div>
    </PageShell>
  );
}
