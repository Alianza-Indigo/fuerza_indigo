import Link from 'next/link';
import { EmptyState, PageShell, Section } from '@/design-system/primitives';
import { SITE_NAV } from '@/platform/i18n';

export const metadata = { title: 'No encontramos esta página' };

/**
 * Pantalla de dirección inexistente del sitio público.
 *
 * Va acompañada del código 404 real que emite `notFound()`. Se separa de la
 * ruta comodín porque Next la usa también para cualquier otra ruta del grupo
 * que llame a `notFound()`, y porque así conserva la cabecera y el pie: quien
 * se pierde necesita el menú más que nadie.
 *
 * En vez de un callejón sin salida ofrece las tres cosas que sirven: buscar,
 * volver al inicio y ver el mapa de secciones.
 */
export default function NoEncontrada() {
  return (
    <PageShell title="No encontramos esta página" width="lectura">
      <div className="space-y-10">
        <EmptyState
          title="La dirección no corresponde a ninguna página"
          description="Puede que el enlace esté mal escrito o que la página haya cambiado de sitio. No se ha perdido nada: desde aquí puedes seguir."
          action={
            <Link href="/buscar" className="font-medium underline underline-offset-4">
              Buscar en el sitio
            </Link>
          }
        />

        <Section title="Secciones del sitio" level={2}>
          <div className="grid gap-6 sm:grid-cols-2">
            {SITE_NAV.map((seccion) => (
              <div key={seccion.title}>
                <h3 className="text-sm font-semibold text-[var(--color-ink-soft)]">{seccion.title}</h3>
                <ul className="mt-2 space-y-1">
                  {seccion.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="underline underline-offset-4">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </PageShell>
  );
}
