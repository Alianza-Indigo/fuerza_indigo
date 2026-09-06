import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, PageShell, Prose, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { catalogoCompleto } from '@/modules/ecosystem';
import { EditarFichaForm, VisibilidadForm } from './catalog-forms';

export const metadata = { title: 'Catálogo del ecosistema', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Administración del catálogo del ecosistema (PRD §12.1; F7-UI-002).
 *
 * Vive dentro de la superficie de contenidos y no en un subsistema aparte,
 * porque eso es lo que es: contenido. Cambiar la dirección de una plataforma es
 * un acto editorial, y quien mantiene el sitio público es quien lo hace.
 *
 * La pantalla enseña **todas** las fichas, incluidas las retiradas de la vista,
 * porque administrar es justamente poder ver lo que el público no ve. La
 * consulta que las trae es distinta de la que sirve al sitio público y exige el
 * permiso: no es la misma con una bandera, que es como una lista de
 * administración acaba servida en una ruta abierta.
 *
 * Lo que no hay aquí, y no va a haber: derechos de acceso, planes, vigencias ni
 * nada que se parezca a operar la plataforma de enfrente. Se administra una
 * ficha y una dirección.
 */
export default async function CatalogoDelEcosistemaPage() {
  const actor = await currentActor();
  const resultado = await catalogoCompleto(actor);

  if (!resultado.ok) {
    return (
      <PageShell title="Catálogo del ecosistema">
        <ErrorNotice title={resultado.error.message} />
      </PageShell>
    );
  }

  const fichas = resultado.data;
  const publicadas = fichas.filter((f) => f.publicada).length;
  const sinAcceso = fichas.filter((f) => f.direccionConfigurada === null).length;

  return (
    <PageShell
      title="Catálogo del ecosistema"
      description="Las plataformas y herramientas que el sitio presenta. Aquí se edita su ficha y su dirección de acceso."
    >
      <div className="space-y-8">
        <Prose>
          <p>
            Estas plataformas <strong>funcionan por su cuenta</strong>, fuera de este sistema. Lo que se
            administra aquí es cómo se presentan y a dónde llevan: su acceso, su operación, sus cobros y sus
            datos son suyos.
          </p>
          <p>
            Cambiar una dirección no necesita desplegar nada y se ve en el sitio público enseguida. Queda
            registrado quién la cambió y cuándo.
          </p>
          {sinAcceso > 0 && (
            <p>
              Hay {sinAcceso} ficha(s) sin dirección configurada. Se ven en el catálogo con su descripción y{' '}
              <strong>sin botón</strong>, que es lo correcto: un botón sin destino real enseña que los botones
              de este sitio a veces no funcionan.
            </p>
          )}
        </Prose>

        <Section title={`${fichas.length} ficha(s) · ${publicadas} visible(s) en el sitio`}>
          {fichas.length === 0 ? (
            <EmptyState
              title="El catálogo está vacío"
              description="Cuando existan fichas aparecerán aquí para administrarlas."
            />
          ) : (
            <ul className="space-y-6">
              {fichas.map((ficha) => (
                <li key={ficha.id}>
                  <Card>
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold">{ficha.name}</h2>
                        <Badge tone={ficha.publicada ? 'success' : 'neutral'}>
                          {ficha.publicada ? 'Visible en el sitio' : 'Retirada de la vista'}
                        </Badge>
                        <Badge tone={ficha.direccionConfigurada === null ? 'warning' : 'accent'}>
                          {ficha.direccionConfigurada === null ? 'Sin acceso configurado' : 'Con acceso'}
                        </Badge>
                        <span className="text-sm">Código: {ficha.code}</span>
                      </div>

                      <EditarFichaForm ficha={ficha} />
                      <VisibilidadForm ficha={ficha} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Prose>
          <p>
            El catálogo se ve en{' '}
            <Link href="/herramientas">la página pública de plataformas y herramientas</Link> y, con las
            mismas fichas, en el portal de cada persona.
          </p>
        </Prose>
      </div>
    </PageShell>
  );
}
