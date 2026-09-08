import Link from 'next/link';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  PageShell,
  ScrollableTable,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { isAuthenticated } from '@/platform/kernel/actor-context';
import { territorialPanel } from '@/modules/governance';
import { territorialIndicators } from '@/modules/dashboards';
import { CIFRA_SUPRIMIDA, type Celda } from '@/platform/privacy/threshold';

export const metadata = { title: 'Panel territorial', robots: { index: false, follow: false } };
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

const ESTADO_UNIDAD: Record<string, { label: string; tone: Tone }> = {
  PLANNED: { label: 'Planeada', tone: 'warning' },
  ACTIVE: { label: 'Activa', tone: 'success' },
  SUSPENDED: { label: 'Suspendida', tone: 'warning' },
  DISSOLVED: { label: 'Disuelta', tone: 'neutral' },
};

const ESTADO_ASAMBLEA: Record<string, string> = {
  PLANNED: 'Planeada',
  CALLED: 'Convocada',
  SECOND_CALL: 'Segunda convocatoria',
  IN_SESSION: 'En sesión',
  CLOSED: 'Cerrada',
  PUBLISHED: 'Publicada',
  CANCELLED: 'Cancelada',
};

/**
 * Panel territorial (PRD §6.3; F5-TER-002).
 *
 * Enseña agregados y enlaces, no listas nominales: para ver el padrón o una
 * solicitud hay que entrar a su pantalla, que vuelve a evaluar su propio
 * permiso. Un tablero que reúne todo lo que alguien podría ver acaba
 * enseñándole lo que no le corresponde.
 */
export default async function PanelTerritorialPage({ params }: { params: Promise<{ unidad: string }> }) {
  const { unidad: publicId } = await params;
  const actor = await currentActor();
  // La raíz (sin cuenta, `userId === null`) también entra: acceso total (ADR-0174).
  if (!isAuthenticated(actor) || (actor.userId === null && actor.actorKind !== 'ROOT_SUPERADMIN')) {
    redirect('/acceso');
  }

  const panel = await territorialPanel(actor, publicId);
  if (!panel.ok) {
    if (panel.error.httpStatus === 404) notFound();
    return (
      <PageShell title="Panel territorial">
        <ErrorNotice title={panel.error.message} />
      </PageShell>
    );
  }

  const { unit, ancestors, enablingResolution, children, roster, applications, bodies, liveOffices, assemblies, indicators } =
    panel.data;

  // Indicadores de formación del último año, con el umbral de privacidad: las
  // cuentas de personas que quedan por debajo se suprimen enteras.
  const hoy = new Date();
  const haceUnAno = new Date(hoy.getTime() - 365 * 24 * 60 * 60 * 1000);
  const aFecha = (fecha: Date): string => fecha.toISOString().slice(0, 10);
  const formacion = await territorialIndicators(actor, {
    unitPublicId: publicId,
    desde: aFecha(haceUnAno),
    hasta: aFecha(hoy),
  });
  const estado = ESTADO_UNIDAD[unit.status] ?? { label: unit.status, tone: 'neutral' as Tone };
  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const fechaHora = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  return (
    <PageShell
      title={unit.name}
      description={`${TIPO[unit.type] ?? unit.type} · constituida el ${fecha.format(unit.createdOn)}`}
      width="ancha"
    >
      <div className="space-y-8">
        {ancestors.length > 0 && (
          <nav aria-label="Unidades de las que depende">
            <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-soft)]">
              {ancestors.map((ascendiente) => (
                <li key={ascendiente.publicId} className="after:ml-2 after:content-['/'] last:after:content-none">
                  <Link href={`/territorio/${ascendiente.publicId}`} className="underline underline-offset-4">
                    {ascendiente.name}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador titulo="Agremiados activos" valor={roster.unionMembers} />
          <Indicador titulo="Afiliados honorarios" valor={roster.honoraryAffiliates} />
          <Indicador titulo="Personas beneficiarias" valor={roster.beneficiaries} />
          <Indicador titulo="Solicitudes por resolver" valor={applications.pending} />
          <Indicador titulo="Membresías suspendidas" valor={roster.suspended} />
          <Indicador titulo="Membresías terminadas" valor={roster.ended} />
          <Indicador titulo="Unidades dependientes" valor={indicators.childUnits} />
          <Indicador titulo="Asambleas del último año" valor={indicators.assembliesLastYear} />
        </section>

        {formacion.ok && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Formación en el territorio (último año)</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Indicador titulo="Eventos realizados" valor={formacion.data.eventosRealizados} />
              <IndicadorCelda titulo="Personas que asistieron" celda={formacion.data.asistentes} />
              <IndicadorCelda titulo="Constancias vigentes" celda={formacion.data.constanciasEmitidas} />
            </div>
            {formacion.data.celdasSuprimidas > 0 && (
              <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                Una cifra que aparece como «{CIFRA_SUPRIMIDA}» se oculta porque, con tan pocas personas,
                el número señalaría a alguien. No es un error: es la privacidad del territorio.
              </p>
            )}
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-lg font-semibold">La unidad</h2>
            <dl className="space-y-2 text-sm">
              <Dato termino="Estado">
                <Badge tone={estado.tone}>{estado.label}</Badge>
                {unit.dissolvedOn !== null && <span className="ml-2">desde {fecha.format(unit.dissolvedOn)}</span>}
              </Dato>
              <Dato termino="Código">
                <span className="font-mono">{unit.code}</span>
              </Dato>
              <Dato termino="Ruta institucional">
                <span className="font-mono">{unit.path}</span>
              </Dato>
              <Dato termino="Correo de contacto">{unit.contactEmail ?? 'Sin correo propio'}</Dato>
              <Dato termino="Acuerdo habilitante">
                {enablingResolution === null
                  ? 'Marco de referencia: no la constituye un acuerdo del sindicato.'
                  : `${enablingResolution.number ?? enablingResolution.publicId} · asamblea ${enablingResolution.assemblyPublicId}`}
              </Dato>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Solicitudes de afiliación</h2>
            <dl className="space-y-2 text-sm">
              <Dato termino="En revisión">{applications.pending}</Dato>
              <Dato termino="Esperando aclaración">{applications.clarification}</Dato>
              <Dato termino="Esperando pago">{applications.awaitingPayment}</Dato>
            </dl>
            <p className="mt-4 text-sm">
              <Link href="/gestion/afiliacion/solicitudes" className="underline underline-offset-4">
                Ver las solicitudes
              </Link>{' '}
              <span className="text-[var(--color-ink-soft)]">
                — la pantalla vuelve a comprobar tus facultades sobre cada expediente.
              </span>
            </p>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Unidades dependientes</h2>
          {children.length === 0 ? (
            <EmptyState
              title="Ninguna unidad depende de esta"
              description="Cuando la asamblea acuerde constituir una sección o delegación por debajo, aparecerá aquí."
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {children.map((hija) => (
                <li key={hija.publicId}>
                  <Link
                    href={`/territorio/${hija.publicId}`}
                    className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-line)] px-3 underline underline-offset-4"
                  >
                    {hija.name}
                    <span className="ml-2 text-xs text-[var(--color-ink-soft)]">{TIPO[hija.type] ?? hija.type}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Responsables en funciones</h2>
          {liveOffices.length === 0 ? (
            <EmptyState
              title="No hay cargos vigentes en esta unidad"
              description="Un cargo vencido pierde el acceso solo. Si esperabas ver a alguien aquí, su periodo terminó."
            />
          ) : (
            <ScrollableTable caption="Cargos vigentes en la unidad">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Cargo</th>
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Hasta</th>
                </tr>
              </thead>
              <tbody>
                {liveOffices.map((cargo) => (
                  <tr key={cargo.officeTermId} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">{cargo.officeName}</td>
                    <td className="p-3">{cargo.personName}</td>
                    <td className="p-3 tabular-nums">{fecha.format(cargo.endsOn)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Órganos con sede en la unidad</h2>
          {bodies.length === 0 ? (
            <EmptyState
              title="No hay ningún órgano con sede aquí"
              description="Los órganos se instalan desde el panel institucional, conforme al estatuto vigente."
            />
          ) : (
            <ul className="space-y-1 text-sm">
              {bodies.map((organo) => (
                <li key={organo.id}>
                  <span className="font-medium">{organo.name}</span>{' '}
                  <span className="font-mono text-xs text-[var(--color-ink-soft)]">{organo.code}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Asambleas y actividades</h2>
          {assemblies.length === 0 ? (
            <EmptyState
              title="Todavía no se ha convocado ninguna asamblea aquí"
              description="Las convocatorias aparecen en cuanto se emiten, con su fecha y su estado."
            />
          ) : (
            <ScrollableTable caption="Asambleas de la unidad, de la más reciente a la más antigua">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Fecha</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Identificador</th>
                </tr>
              </thead>
              <tbody>
                {assemblies.map((asamblea) => (
                  <tr key={asamblea.publicId} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3 tabular-nums">{fechaHora.format(asamblea.scheduledAt)}</td>
                    <td className="p-3">{ESTADO_ASAMBLEA[asamblea.status] ?? asamblea.status}</td>
                    <td className="p-3 font-mono text-xs">{asamblea.publicId}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <Card>
      <p className="text-sm text-[var(--color-ink-soft)]">{titulo}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{valor}</p>
    </Card>
  );
}

/** Un indicador que puede venir suprimido por el umbral de privacidad. */
function IndicadorCelda({ titulo, celda }: { titulo: string; celda: Celda }) {
  return (
    <Card>
      <p className="text-sm text-[var(--color-ink-soft)]">{titulo}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">
        {celda.publicable ? celda.valor : CIFRA_SUPRIMIDA}
      </p>
    </Card>
  );
}

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-medium">{termino}:</dt>
      <dd>{children}</dd>
    </div>
  );
}
