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
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import {
  appointableMemberships,
  officeList,
  officeTermList,
  powerGrantList,
  unionBodyList,
  type OfficeRow,
} from '@/modules/governance';
import { publishedTemplateOptions } from '@/modules/documents';
import { grantablePeople } from '@/modules/governance';
import { territoryOptions } from '@/modules/access';
import { AppointForm, EndTermForm, GrantPowerForm, RevokePowerForm } from './term-forms';

export const metadata = { title: 'Periodos y poderes', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const METODO: Record<string, string> = {
  ELECTION: 'Elección',
  ASSEMBLY_APPOINTMENT: 'Designación por asamblea',
  SUBSTITUTION: 'Suplencia',
  INTERIM: 'Interinato',
};

const PODER: Record<string, string> = {
  LEGAL_REPRESENTATION: 'Representación legal',
  BANKING: 'Actos bancarios',
  LABOR_AUTHORITY: 'Autoridad laboral',
  ADMINISTRATIVE: 'Actos administrativos',
  SPECIAL: 'Poder especial',
};

/**
 * Periodos de cargo y poderes (PRD §9.2; F5-GOB-002).
 *
 * La columna «acceso» de la tabla no es decorativa: enseña si el nombramiento
 * sigue concediendo algo. Un periodo vencido aparece sin acceso porque el
 * trabajo programado lo retiró, no porque alguien se acordara.
 */
export default async function NombramientosPage() {
  const actor = await currentActor();

  const [periodos, cargos, personas, apoderables, territorios, poderes, plantillas, organos] = await Promise.all([
    officeTermList(actor),
    officeList(actor),
    appointableMemberships(actor),
    grantablePeople(actor),
    territoryOptions(actor),
    powerGrantList(actor),
    publishedTemplateOptions(actor, 'POWER_GRANT'),
    unionBodyList(actor),
  ]);

  const puedeNombrar = can({ ...actor, reason: 'designación en un cargo' }, 'governance.office.appoint', {
    kind: 'OfficeTerm',
  }).allowed;
  const puedeConcluir = can({ ...actor, reason: 'conclusión de un periodo' }, 'governance.office.end', {
    kind: 'OfficeTerm',
  }).allowed;
  const puedeApoderar = can({ ...actor, reason: 'otorgamiento de poderes' }, 'governance.power.grant', {
    kind: 'PowerGrant',
  }).allowed;
  const puedeRevocarPoder = can({ ...actor, reason: 'revocación de poderes' }, 'governance.power.revoke', {
    kind: 'PowerGrant',
  }).allowed;

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  const opcionesDeCargo = (predicate: (cargo: OfficeRow) => boolean): readonly Option[] =>
    cargos.ok
      ? cargos.data
          .filter((cargo) => cargo.occupiedSeats < cargo.seats && predicate(cargo))
          .map((cargo) => ({
          value: cargo.id,
          label: `${cargo.name} · ${cargo.bodyName} · ${cargo.seats - cargo.occupiedSeats} plaza(s) libre(s)`,
          }))
      : [];
  const opcionesCargoCen = opcionesDeCargo((cargo) => cargo.bodyKind === 'NATIONAL_EXECUTIVE_COMMITTEE');
  const opcionesCargoVigilancia = opcionesDeCargo((cargo) => cargo.bodyKind === 'OVERSIGHT_COMMISSION');
  const opcionesCargoOtros = opcionesDeCargo(
    (cargo) => cargo.bodyKind !== 'NATIONAL_EXECUTIVE_COMMITTEE' && cargo.bodyKind !== 'OVERSIGHT_COMMISSION',
  );
  const opcionesPersona: readonly Option[] = personas.ok ? personas.data.map((p) => ({ value: p.value, label: p.label })) : [];
  const opcionesApoderable: readonly Option[] = apoderables.ok
    ? apoderables.data.map((p) => ({ value: p.value, label: p.label }))
    : [];
  const opcionesTerritorio: readonly Option[] = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];
  const periodosVivos = periodos.ok ? periodos.data.filter((periodo) => periodo.accessLive) : [];
  const opcionesPeriodo: readonly Option[] = periodosVivos.map((periodo) => ({
    value: periodo.id,
    label: `${periodo.officeName} · ${periodo.personName}`,
  }));
  const opcionesPlantilla: readonly Option[] = plantillas.ok
    ? plantillas.data.map((plantilla) => ({ value: plantilla.value, label: plantilla.label }))
    : [];
  const cen = organos.ok
    ? organos.data.find((organo) => organo.kind === 'NATIONAL_EXECUTIVE_COMMITTEE' && organo.status === 'ACTIVE')
    : undefined;
  const vigilancia = organos.ok
    ? organos.data.find((organo) => organo.kind === 'OVERSIGHT_COMMISSION' && organo.status === 'ACTIVE')
    : undefined;

  return (
    <PageShell
      title="Periodos y poderes"
      description="Los cargos son registros históricos con periodo, forma de designación y documento probatorio. El acceso vive atado al periodo: al vencer, se retira solo, y con él los poderes que salieron de ese cargo."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Periodos de cargo</h2>
          {!periodos.ok ? (
            <ErrorNotice title={periodos.error.message} />
          ) : periodos.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ningún periodo registrado"
              description="Cuando se nombre a la primera persona aparecerá aquí, con su vigencia."
            />
          ) : (
            <ScrollableTable caption="Periodos de cargo, del más reciente al más antiguo">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Cargo</th>
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Designación</th>
                  <th scope="col" className="p-3 font-medium">Vigencia</th>
                  <th scope="col" className="p-3 font-medium">Acceso</th>
                  {puedeConcluir && (
                    <th scope="col" className="p-3 font-medium">
                      <span className="sr-only">Concluir</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {periodos.data.map((periodo) => (
                  <tr key={periodo.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      <span className="font-medium">{periodo.officeName}</span>
                      <span className="block text-xs text-[var(--color-ink-soft)]">{periodo.bodyName}</span>
                      {periodo.territory !== null && (
                        <span className="block text-xs text-[var(--color-ink-soft)]">{periodo.territory}</span>
                      )}
                    </td>
                    <td className="p-3">{periodo.personName}</td>
                    <td className="p-3">{METODO[periodo.designationMethod] ?? periodo.designationMethod}</td>
                    <td className="p-3 tabular-nums">
                      <div>desde {fecha.format(periodo.startsOn)}</div>
                      <div className="text-xs text-[var(--color-ink-soft)]">hasta {fecha.format(periodo.endsOn)}</div>
                      {periodo.endedEarlyOn !== null && (
                        <div className="text-xs text-[var(--color-ink-soft)]">
                          concluido el {fecha.format(periodo.endedEarlyOn)}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {periodo.accessLive ? <Badge tone="success">Vivo</Badge> : <Badge tone="neutral">Retirado</Badge>}
                    </td>
                    {puedeConcluir && (
                      <td className="p-3">
                        {periodo.accessLive && (
                          <Disclosure summary="Concluir">
                            <EndTermForm officeTermId={periodo.id} personName={periodo.personName} />
                          </Disclosure>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        {puedeNombrar && (
          <>
            <section id="nombramientos-iniciales" className="scroll-mt-6">
              <h2 className="mb-2 text-lg font-semibold">Nombramiento de los órganos nacionales iniciales</h2>
              <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
                Registra aquí la integración consignada en el acta constitutiva. Solo aparecen agremiados activos con
                voz y voto; una misma persona no puede integrar simultáneamente el Comité Ejecutivo y la Comisión de
                Vigilancia.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold">Comité Ejecutivo Nacional</h3>
                    {cen !== undefined && (
                      <Badge tone={opcionesCargoCen.length === 0 && cen.officeCount > 0 ? 'success' : 'warning'}>
                        {cen.filledSeats} nombramiento(s)
                      </Badge>
                    )}
                  </div>
                  {cen === undefined ? (
                    <Notice tone="warning" title="El Comité Ejecutivo Nacional no está instalado">
                      <p>Primero instala el órgano y define sus secretarías conforme al acta.</p>
                      <Link href="/institucional/organos" className="mt-2 inline-block underline underline-offset-4">
                        Ir a Órganos y cargos
                      </Link>
                    </Notice>
                  ) : cen.officeCount === 0 ? (
                    <Notice tone="warning" title="Faltan las secretarías del Comité">
                      <p>El órgano existe, pero todavía no tiene cargos definidos.</p>
                      <Link href="/institucional/organos" className="mt-2 inline-block underline underline-offset-4">
                        Definir secretarías
                      </Link>
                    </Notice>
                  ) : opcionesCargoCen.length === 0 ? (
                    <Notice tone="success" title="Comité Ejecutivo Nacional integrado">
                      <p>Todas las plazas definidas tienen un periodo registrado.</p>
                    </Notice>
                  ) : (
                    <AppointForm
                      cargos={opcionesCargoCen}
                      personas={opcionesPersona}
                      territorios={opcionesTerritorio}
                      periodos={opcionesPeriodo}
                    />
                  )}
                </Card>

                <Card>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold">Comisión de Vigilancia y Fiscalización</h3>
                    {vigilancia !== undefined && (
                      <Badge tone={opcionesCargoVigilancia.length === 0 && vigilancia.officeCount > 0 ? 'success' : 'warning'}>
                        {vigilancia.filledSeats} nombramiento(s)
                      </Badge>
                    )}
                  </div>
                  {vigilancia === undefined ? (
                    <Notice tone="warning" title="La Comisión de Vigilancia no está instalada">
                      <p>Primero instala la Comisión y define sus tres plazas conforme a las reglas vigentes.</p>
                      <Link href="/institucional/organos" className="mt-2 inline-block underline underline-offset-4">
                        Ir a Órganos y cargos
                      </Link>
                    </Notice>
                  ) : vigilancia.officeCount === 0 ? (
                    <Notice tone="warning" title="Faltan las plazas de Vigilancia">
                      <p>La Comisión existe, pero todavía no tiene el cargo y sus tres plazas definidos.</p>
                      <Link href="/institucional/organos" className="mt-2 inline-block underline underline-offset-4">
                        Definir las plazas
                      </Link>
                    </Notice>
                  ) : opcionesCargoVigilancia.length === 0 ? (
                    <Notice tone="success" title="Comisión de Vigilancia integrada">
                      <p>Todas sus plazas tienen un periodo registrado.</p>
                    </Notice>
                  ) : (
                    <AppointForm
                      cargos={opcionesCargoVigilancia}
                      personas={opcionesPersona}
                      territorios={opcionesTerritorio}
                      periodos={opcionesPeriodo}
                    />
                  )}
                </Card>
              </div>
            </section>

            {opcionesCargoOtros.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Nombrar en otros órganos</h2>
                <Card>
                  <AppointForm
                    cargos={opcionesCargoOtros}
                    personas={opcionesPersona}
                    territorios={opcionesTerritorio}
                    periodos={opcionesPeriodo}
                  />
                </Card>
              </section>
            )}
          </>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Poderes y representaciones</h2>
          {!poderes.ok ? (
            <ErrorNotice title={poderes.error.message} />
          ) : poderes.data.length === 0 ? (
            <EmptyState
              title="No hay ningún poder otorgado"
              description="Los poderes salen de un cargo en funciones y llevan siempre su documento probatorio."
            />
          ) : (
            <div className="space-y-3">
              {poderes.data.map((poder) => (
                <Card key={poder.id}>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold">{poder.granteeName}</h3>
                    <Badge tone={poder.live ? 'success' : 'neutral'}>{poder.live ? 'Vigente' : 'Sin efecto'}</Badge>
                    <Badge tone="accent">{PODER[poder.powerKind] ?? poder.powerKind}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    Otorgado por {poder.grantorName}, {poder.officeName} · desde {fecha.format(poder.startsOn)}
                    {poder.endsOn === null ? ' hasta el término del cargo' : ` hasta ${fecha.format(poder.endsOn)}`}
                    {poder.revokedOn !== null && ` · revocado el ${fecha.format(poder.revokedOn)}`}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">Documento:</span>{' '}
                    <span className="font-mono text-xs">{poder.documentFolio ?? poder.documentPublicId}</span>
                    {poder.notaryReference !== null && ` · ${poder.notaryReference}`}
                  </p>
                  <div className="mt-3">
                    <Disclosure summary="Alcance">
                      <p className="whitespace-pre-line text-sm">{poder.scope}</p>
                    </Disclosure>
                  </div>
                  {puedeRevocarPoder && poder.live && (
                    <div className="mt-3">
                      <Disclosure summary="Revocar">
                        <RevokePowerForm powerGrantId={poder.id} granteeName={poder.granteeName} />
                      </Disclosure>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {puedeApoderar && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Otorgar un poder</h2>
            <Card>
              <GrantPowerForm
                periodos={opcionesPeriodo}
                personas={opcionesApoderable}
                plantillas={opcionesPlantilla}
              />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
