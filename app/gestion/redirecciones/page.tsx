import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { editorialPages, listRedirects } from '@/modules/content';
import { RedirectForm } from './redirect-form';
import { DeleteRedirectForm } from './delete-form';

export const metadata = { title: 'Redirecciones', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Redirecciones de direcciones antiguas (F2-CMS-003).
 *
 * Una dirección publicada es una promesa: alguien la escribió en un volante, la
 * mandó por mensaje o la citó en un oficio. Esta pantalla es donde esa promesa
 * se mantiene cuando el contenido se muda.
 *
 * La columna de usos no es estadística ociosa: una redirección que nadie ha
 * seguido en un año puede retirarse, y una que se sigue mucho dice que el
 * enlace viejo todavía circula por ahí.
 */
export default async function RedireccionesPage() {
  const actor = await currentActor();
  const [redirecciones, paginas] = await Promise.all([listRedirects(actor), editorialPages(actor)]);

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  const destinos = paginas.ok
    ? paginas.data.map((pagina) => ({ id: pagina.id, label: `${pagina.title} — /${pagina.slug}` }))
    : [];

  return (
    <PageShell
      title="Redirecciones"
      description="Direcciones que un contenido tuvo antes y que tienen que seguir llevando a alguna parte."
      width="ancha"
    >
      <div className="space-y-10">
        {!redirecciones.ok ? (
          <ErrorNotice title={redirecciones.error.message} />
        ) : redirecciones.data.length === 0 ? (
          <EmptyState
            title="No hay ninguna redirección"
            description="Cuando un contenido cambie de dirección, crea aquí la redirección desde la vieja para que los enlaces que ya circulan sigan funcionando."
          />
        ) : (
          <ScrollableTable caption="Redirecciones activas, con su destino, si son definitivas y cuántas veces se han seguido">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left">
                <th scope="col" className="p-3 font-medium">Dirección vieja</th>
                <th scope="col" className="p-3 font-medium">Lleva a</th>
                <th scope="col" className="p-3 font-medium">Tipo</th>
                <th scope="col" className="p-3 font-medium">Usos</th>
                <th scope="col" className="p-3 font-medium">Creada</th>
                <th scope="col" className="p-3 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {redirecciones.data.map((fila) => (
                <tr key={fila.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                  <td className="p-3 font-mono text-sm">/{fila.fromSlug}</td>
                  <td className="p-3">
                    <span className="font-mono text-sm">{fila.destino}</span>
                    {!fila.destinoVigente && (
                      <span className="mt-1 block text-xs font-medium text-[var(--color-warning)]">
                        El destino no está publicado: quien siga este enlace verá un 404
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge tone={fila.permanent ? 'accent' : 'neutral'}>
                      {fila.permanent ? 'Definitiva' : 'Temporal'}
                    </Badge>
                  </td>
                  <td className="p-3 tabular-nums">{fila.hitCount}</td>
                  <td className="p-3 tabular-nums text-sm">{formatter.format(fila.createdAt)}</td>
                  <td className="p-3">
                    <DeleteRedirectForm redirectId={fila.id} fromSlug={fila.fromSlug} />
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollableTable>
        )}

        <Section title="Crear una redirección" level={2}>
          <Card>
            <RedirectForm paginas={destinos} />
          </Card>
        </Section>
      </div>
    </PageShell>
  );
}
