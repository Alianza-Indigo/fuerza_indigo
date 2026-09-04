import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { billableEntities, catalogList } from '@/modules/billing';
import { formatMoney } from '@/platform/i18n';
import { ProductForm } from './product-form';

export const metadata = { title: 'Catálogo de cobros', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PERIODICIDAD: Record<string, string> = {
  MONTH: 'al mes',
  QUARTER: 'al trimestre',
  SEMESTER: 'al semestre',
  YEAR: 'al año',
};

const TIPO: Record<string, string> = {
  ENROLLMENT_FEE: 'Inscripción',
  UNION_DUE_ORDINARY: 'Cuota ordinaria',
  UNION_DUE_EXTRAORDINARY: 'Cuota extraordinaria',
  HONORARY_MEMBERSHIP: 'Membresía honoraria',
  SERVICE_SUBSCRIPTION: 'Suscripción',
  COURSE: 'Curso',
  CIAN_SERVICE: 'Servicio del CIAN',
  CENI_PROGRAM: 'Programa del CENI',
  CENI_ASSESSMENT: 'Evaluación del CENI',
  CENI_CERTIFICATION: 'Certificación del CENI',
  RENEWAL: 'Renovación',
  DONATION: 'Donativo',
};

/**
 * Catálogo de conceptos cobrables (F3-PAG-001).
 *
 * Aquí vive todo lo que la organización cobra. Ninguna otra pantalla del
 * sistema escribe un importe: lo lee de aquí. Por eso la columna del precio
 * dice «sin precio» cuando falta, en vez de enseñar un cero: un concepto sin
 * precio vigente no es gratis, es un concepto que todavía no se puede cobrar.
 */
export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string }>;
}) {
  const actor = await currentActor();
  const { archivados } = await searchParams;
  const verArchivados = archivados === '1';

  const [conceptos, entidades] = await Promise.all([
    catalogList(actor, { includeArchived: verArchivados }),
    billableEntities(actor),
  ]);

  const formato = { locale: actor.locale, timeZone: actor.timeZone };

  const opciones = entidades.ok
    ? entidades.data.map((entidad) => ({ id: entidad.id, label: entidad.shortName }))
    : [];

  return (
    <PageShell
      title="Catálogo de cobros"
      description="Todo lo que la organización cobra, y cuánto cuesta hoy. Cambiar un importe crea una versión con fecha: no reescribe el pasado."
      width="ancha"
    >
      <div className="space-y-10">
        {!conceptos.ok ? (
          <ErrorNotice title={conceptos.error.message} />
        ) : conceptos.data.length === 0 ? (
          <EmptyState
            title={verArchivados ? 'No hay ningún concepto, ni siquiera archivado' : 'Todavía no hay ningún concepto'}
            description="Nada se cobra hasta que aquí exista un concepto con un precio vigente. Créalo abajo: ni las cuotas ni las cantidades vienen puestas de fábrica, porque las acuerda la organización."
          />
        ) : (
          <>
            <ScrollableTable caption="Conceptos del catálogo, con su precio vigente y cuántas versiones de precio ha tenido cada uno">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Concepto</th>
                  <th scope="col" className="p-3 font-medium">Entidad</th>
                  <th scope="col" className="p-3 font-medium">Tipo</th>
                  <th scope="col" className="p-3 font-medium">Precio vigente</th>
                  <th scope="col" className="p-3 font-medium">Versiones</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {conceptos.data.map((fila) => (
                  <tr key={fila.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      <Link
                        href={`/gestion/finanzas/catalogo/${fila.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {fila.name}
                      </Link>
                      <span className="mt-1 block font-mono text-xs text-[var(--color-ink-soft)]">{fila.code}</span>
                    </td>
                    <td className="p-3">{fila.legalEntityShortName}</td>
                    <td className="p-3">{TIPO[fila.kind] ?? fila.kind}</td>
                    <td className="p-3 tabular-nums">
                      {fila.currentAmountMinor === null || fila.currentCurrency === null ? (
                        <span className="text-[var(--color-warning)]">
                          Sin precio vigente: todavía no se puede cobrar
                        </span>
                      ) : (
                        <>
                          {formatMoney(fila.currentAmountMinor, fila.currentCurrency, formato)}
                          {fila.currentInterval !== null && (
                            <span className="text-[var(--color-ink-soft)]"> {PERIODICIDAD[fila.currentInterval]}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">{fila.priceVersions}</td>
                    <td className="p-3">
                      {fila.archivedAt !== null ? (
                        <Badge tone="neutral">Archivado</Badge>
                      ) : fila.billingMode === 'RECURRING' ? (
                        <Badge tone="accent">Recurrente</Badge>
                      ) : (
                        <Badge tone="neutral">Pago único</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>

            <p>
              <Link
                href={verArchivados ? '/gestion/finanzas/catalogo' : '/gestion/finanzas/catalogo?archivados=1'}
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                {verArchivados ? 'Ver solo los conceptos vigentes' : 'Ver también los conceptos archivados'}
              </Link>
            </p>
          </>
        )}

        {opciones.length > 0 && (
          <Section title="Crear un concepto" level={2}>
            <Card>
              <ProductForm entidades={opciones} />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
