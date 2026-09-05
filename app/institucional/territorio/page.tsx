import Link from 'next/link';
import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  PageShell,
  ScrollableTable,
  type Option,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { enablingResolutionOptions, territorialTree } from '@/modules/governance';
import { CreateUnitForm, DissolveUnitForm, UpdateUnitForm } from './territory-forms';

export const metadata = { title: 'Estructura territorial', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TIPO: Record<string, string> = {
  NATIONAL: 'Nacional',
  FOREIGN_COUNTRY: 'País extranjero',
  STATE: 'Entidad federativa',
  MUNICIPALITY: 'Municipio',
  SECTION: 'Sección',
  DELEGATION: 'Delegación',
  OFFICE: 'Representación',
  VIRTUAL_THEMATIC: 'Ámbito virtual o temático',
};

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  PLANNED: { label: 'Planeada', tone: 'warning' },
  ACTIVE: { label: 'Activa', tone: 'success' },
  SUSPENDED: { label: 'Suspendida', tone: 'warning' },
  DISSOLVED: { label: 'Disuelta', tone: 'neutral' },
};

/**
 * Estructura territorial (PRD §9.1; F5-TER-001).
 *
 * El árbol se dibuja con la sangría que ya trae el orden por ruta: la lista
 * llega ordenada de modo que cada unidad aparece después de su madre, y la
 * profundidad basta para sangrarla. No hay que reconstruir la jerarquía aquí.
 */
export default async function EstructuraTerritorialPage() {
  const actor = await currentActor();

  const [arbol, acuerdos] = await Promise.all([
    territorialTree(actor, { includeDissolved: true }),
    enablingResolutionOptions(actor),
  ]);

  const puedeCrear = can({ ...actor, reason: 'alta de unidad territorial' }, 'territory.unit.create', {
    kind: 'TerritorialUnit',
  }).allowed;
  const puedeEditar = can({ ...actor, reason: 'edición de unidad territorial' }, 'territory.unit.update', {
    kind: 'TerritorialUnit',
  }).allowed;

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  const opcionesPadre: readonly Option[] = arbol.ok
    ? arbol.data
        .filter((unidad) => unidad.dissolvedOn === null)
        .map((unidad) => ({
          value: unidad.id,
          label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
        }))
    : [];

  const opcionesAcuerdo: readonly Option[] = acuerdos.ok
    ? acuerdos.data.map((acuerdo) => ({ value: acuerdo.id, label: acuerdo.label }))
    : [];

  return (
    <PageShell
      title="Estructura territorial"
      description="Cada unidad nace de un acuerdo de asamblea y conserva su historia. Disolver no borra: cambia el estado y deja la fecha."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Unidades</h2>
          {!arbol.ok ? (
            <ErrorNotice title={arbol.error.message} />
          ) : arbol.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna unidad territorial"
              description="La semilla instala el tronco nacional y las entidades federativas. Si no ves ninguna, la base no se ha sembrado."
            />
          ) : (
            <ScrollableTable caption="Unidades territoriales por orden jerárquico">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Unidad</th>
                  <th scope="col" className="p-3 font-medium">Tipo</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Acuerdo</th>
                  <th scope="col" className="p-3 font-medium">Panel</th>
                </tr>
              </thead>
              <tbody>
                {arbol.data.map((unidad) => {
                  const estado = ESTADO[unidad.status] ?? { label: unidad.status, tone: 'neutral' as Tone };
                  return (
                    <tr key={unidad.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                      <td className="p-3">
                        <span style={{ paddingInlineStart: `${unidad.depth * 1.25}rem` }} className="inline-block">
                          <span className="font-medium">{unidad.name}</span>
                          <span className="block font-mono text-xs text-[var(--color-ink-soft)]">{unidad.path}</span>
                        </span>
                      </td>
                      <td className="p-3">{TIPO[unidad.type] ?? unidad.type}</td>
                      <td className="p-3">
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                        {unidad.dissolvedOn !== null && (
                          <span className="block text-xs text-[var(--color-ink-soft)]">
                            desde {formatter.format(unidad.dissolvedOn)}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        {unidad.hasEnablingResolution ? (
                          <Badge tone="success">Con acuerdo</Badge>
                        ) : unidad.depth === 0 || unidad.type === 'STATE' ? (
                          <span className="text-xs text-[var(--color-ink-soft)]">Marco de referencia</span>
                        ) : (
                          <Badge tone="warning">Sin acuerdo</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/territorio/${unidad.publicId}`}
                          className="inline-flex min-h-11 items-center underline underline-offset-4"
                        >
                          Abrir<span className="sr-only"> el panel de {unidad.name}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        {puedeCrear && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Constituir una unidad</h2>
            <Card>
              <CreateUnitForm padres={opcionesPadre} acuerdos={opcionesAcuerdo} />
            </Card>
          </section>
        )}

        {puedeEditar && arbol.ok && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Editar o disolver</h2>
            <div className="space-y-3">
              {arbol.data
                .filter((unidad) => unidad.dissolvedOn === null && unidad.depth > 0)
                .map((unidad) => (
                  <Disclosure key={unidad.id} summary={`${unidad.name} · ${unidad.path}`}>
                    <div className="grid gap-8 md:grid-cols-2">
                      <UpdateUnitForm
                        territorialUnitId={unidad.id}
                        name={unidad.name}
                        contactEmail={unidad.contactEmail}
                        status={unidad.status}
                      />
                      <DissolveUnitForm territorialUnitId={unidad.id} name={unidad.name} />
                    </div>
                  </Disclosure>
                ))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
