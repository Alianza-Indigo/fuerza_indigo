import Link from 'next/link';
import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Notice,
  PageShell,
  ScrollableTable,
  type Option,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { officeList, permissionOptions, unionBodyList } from '@/modules/governance';
import { territoryOptions } from '@/modules/access';
import { listLegalEntities } from '@/modules/admin';
import {
  CreateBodyForm,
  DefineOfficeForm,
  DefineTerritorialOfficeForm,
  IncompatibilityForm,
} from './governance-forms';

export const metadata = { title: 'Órganos y cargos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO_ORGANO: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Activo', tone: 'success' },
  INACTIVE: { label: 'Inactivo', tone: 'warning' },
  DISSOLVED: { label: 'Disuelto', tone: 'neutral' },
};

const TIPO_AUTORIDAD_TERRITORIAL: readonly Option[] = [
  { value: 'SECTION_DELEGATION', label: 'Autoridad de delegación o sección' },
];

const TIPOS_ORGANO_NACIONAL: readonly Option[] = [
  { value: 'GENERAL_ASSEMBLY', label: 'Asamblea General' },
  { value: 'NATIONAL_EXECUTIVE_COMMITTEE', label: 'Comité Ejecutivo Nacional' },
  { value: 'OVERSIGHT_COMMISSION', label: 'Comisión de Vigilancia y Fiscalización' },
  { value: 'ELECTORAL_COMMISSION', label: 'Comisión Electoral' },
  { value: 'TEMPORARY_COMMISSION', label: 'Comisión temporal' },
];

/**
 * Órganos de gobierno y cargos (PRD §9.2, §9.3; F5-GOB-001, F5-GOB-004).
 *
 * La tabla de cargos enseña las plazas ocupadas frente a las que hay, y las
 * incompatibilidades declaradas. Son los dos datos con los que se decide un
 * nombramiento, y tenerlos delante evita el nombramiento que la base va a
 * rechazar después de que alguien escribió el motivo.
 */
export default async function OrganosPage() {
  const actor = await currentActor();

  // `permissionOptions` lee del catálogo en código y no consulta nada: es
  // síncrona, y meterla en el `Promise.all` sería fingir que espera.
  const permisos = permissionOptions(actor);
  const [organos, cargos, territorios, entidades] = await Promise.all([
    unionBodyList(actor),
    officeList(actor),
    territoryOptions(actor),
    listLegalEntities(actor),
  ]);

  const puedeAdministrar = can({ ...actor, reason: 'administración de órganos' }, 'governance.body.manage', {
    kind: 'UnionBody',
  }).allowed;

  const opcionesTerritorio: readonly Option[] = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];
  const opcionesTerritorioDesplegable: readonly Option[] = territorios.ok
    ? territorios.data
        .filter(
          (unidad) =>
            (unidad.type === 'DELEGATION' || unidad.type === 'SECTION') && unidad.status === 'ACTIVE',
        )
        .map((unidad) => ({
          value: unidad.id,
          label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
        }))
    : [];
  const opcionesEntidad: readonly Option[] = entidades.ok
    ? entidades.data.map((entidad) => ({ value: entidad.id, label: entidad.shortName }))
    : [];
  const opcionesOrgano: readonly Option[] = organos.ok
    ? organos.data
        .filter((organo) => organo.status === 'ACTIVE' && organo.kind !== 'SECTION_DELEGATION')
        .map((organo) => ({ value: organo.id, label: organo.name }))
    : [];
  const opcionesOrganoTerritorial: readonly Option[] = organos.ok
    ? organos.data
        .filter((organo) => organo.status === 'ACTIVE' && organo.kind === 'SECTION_DELEGATION')
        .map((organo) => ({ value: organo.id, label: `${organo.name} · ${organo.territory}` }))
    : [];
  const opcionesCargo: readonly Option[] = cargos.ok
    ? cargos.data.map((cargo) => ({ value: cargo.id, label: `${cargo.name} · ${cargo.bodyName}` }))
    : [];
  const opcionesPermiso: readonly Option[] = permisos.ok
    ? permisos.data.map((permiso) => ({ value: permiso.value, label: permiso.label }))
    : [];

  return (
    <PageShell
      title="Órganos y cargos"
      description="Quién decide qué, con qué facultades y por cuánto tiempo. Un cargo concede permisos concretos, no un rol entero, y las incompatibilidades valen en los dos sentidos."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Órganos</h2>
          {!organos.ok ? (
            <ErrorNotice title={organos.error.message} />
          ) : organos.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ningún órgano instalado"
              description="Un órgano se instala conforme a una versión de reglas estatutarias en vigor."
            />
          ) : (
            <ScrollableTable caption="Órganos de gobierno">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Órgano</th>
                  <th scope="col" className="p-3 font-medium">Territorio</th>
                  <th scope="col" className="p-3 font-medium">Entidad</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Cargos</th>
                </tr>
              </thead>
              <tbody>
                {organos.data.map((organo) => {
                  const estado = ESTADO_ORGANO[organo.status] ?? { label: organo.status, tone: 'neutral' as Tone };
                  return (
                    <tr key={organo.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                      <td className="p-3">
                        <span className="font-medium">{organo.name}</span>
                        <span className="block font-mono text-xs text-[var(--color-ink-soft)]">{organo.code}</span>
                      </td>
                      <td className="p-3">{organo.territory}</td>
                      <td className="p-3">{organo.legalEntity}</td>
                      <td className="p-3">
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                      </td>
                      <td className="p-3 tabular-nums">
                        {organo.officeCount} definidos · {organo.filledSeats} ocupados
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        {puedeAdministrar && (
          <section id="organos-territoriales" className="scroll-mt-6">
            <h2 className="mb-2 text-lg font-semibold">Implementar una delegación o sección</h2>
            <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
              Cada unidad territorial activa recibe su propia autoridad, un cargo responsable y un nombramiento con
              acceso limitado a ese territorio. No es una etiqueta sobre la cuenta: queda como periodo histórico.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h3 className="mb-3 font-semibold">1. Instalar la autoridad territorial</h3>
                {opcionesTerritorioDesplegable.length === 0 ? (
                  <Notice tone="warning" title="Primero constituye y activa una unidad">
                    <p>Hace falta una delegación o sección activa antes de instalar a su autoridad.</p>
                    <Link
                      href="/institucional/territorio#delegaciones-secciones"
                      className="mt-2 inline-block underline underline-offset-4"
                    >
                      Constituir delegación o sección
                    </Link>
                  </Notice>
                ) : (
                  <CreateBodyForm
                    territorios={opcionesTerritorioDesplegable}
                    entidades={opcionesEntidad}
                    tipos={TIPO_AUTORIDAD_TERRITORIAL}
                    territoryHint="Solo aparecen delegaciones y secciones activas que pueden recibir autoridad."
                    submitLabel="Instalar autoridad territorial"
                  />
                )}
              </Card>

              <Card>
                <h3 className="mb-3 font-semibold">2. Definir el cargo responsable</h3>
                {opcionesOrganoTerritorial.length === 0 ? (
                  <Notice tone="warning" title="Primero instala la autoridad territorial">
                    <p>Después de instalarla, aquí podrás definir la titularidad y la duración de su periodo.</p>
                  </Notice>
                ) : (
                  <DefineTerritorialOfficeForm organos={opcionesOrganoTerritorial} />
                )}
              </Card>
            </div>
            <p className="mt-4 text-sm">
              Cuando el cargo esté definido, continúa en{' '}
              <Link
                href="/institucional/nombramientos#nombramientos-territoriales"
                className="underline underline-offset-4"
              >
                nombramientos territoriales
              </Link>
              .
            </p>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Cargos y facultades</h2>
          {!cargos.ok ? (
            <ErrorNotice title={cargos.error.message} />
          ) : cargos.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ningún cargo definido"
              description="Cada cargo declara sus facultades: sin ellas no abre ninguna puerta."
            />
          ) : (
            <div className="space-y-3">
              {cargos.data.map((cargo) => (
                <Card key={cargo.id}>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold">{cargo.name}</h3>
                    <Badge tone={cargo.occupiedSeats >= cargo.seats ? 'warning' : 'success'}>
                      {cargo.occupiedSeats} de {cargo.seats} plazas
                    </Badge>
                    {cargo.reelectionAllowed && <Badge tone="neutral">Reelegible</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    {cargo.bodyName} · periodo de {cargo.termMonths} meses · <span className="font-mono">{cargo.code}</span>
                  </p>

                  {cargo.incompatibleWith.length > 0 && (
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Incompatible con:</span> {cargo.incompatibleWith.join(', ')}
                    </p>
                  )}

                  <div className="mt-3">
                    <Disclosure summary={`Facultades (${cargo.permissionCodes.length})`}>
                      <ul className="grid gap-1 text-sm sm:grid-cols-2">
                        {cargo.permissionCodes.map((codigo) => (
                          <li key={codigo} className="font-mono text-xs">
                            {codigo}
                          </li>
                        ))}
                      </ul>
                    </Disclosure>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {puedeAdministrar && (
          <>
            <section>
              <h2 className="mb-3 text-lg font-semibold">Instalar otro órgano</h2>
              <Card>
                <CreateBodyForm
                  territorios={opcionesTerritorio}
                  entidades={opcionesEntidad}
                  tipos={TIPOS_ORGANO_NACIONAL}
                />
              </Card>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Definir un cargo</h2>
              <Card>
                {opcionesOrgano.length === 0 ? (
                  <ErrorNotice title="Primero hay que instalar un órgano">
                    <p>Un cargo pertenece a un órgano. Instala el órgano y vuelve.</p>
                  </ErrorNotice>
                ) : (
                  <DefineOfficeForm organos={opcionesOrgano} permisos={opcionesPermiso} />
                )}
              </Card>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Declarar una incompatibilidad</h2>
              <Card>
                {opcionesCargo.length < 2 ? (
                  <ErrorNotice title="Hacen falta al menos dos cargos">
                    <p>Una incompatibilidad relaciona dos cargos. Define el segundo y vuelve.</p>
                  </ErrorNotice>
                ) : (
                  <IncompatibilityForm cargos={opcionesCargo} />
                )}
              </Card>
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
