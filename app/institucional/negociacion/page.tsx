import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  PageShell,
  type Option,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { bargainingFileList } from '@/modules/bargaining';
import { approvedResolutionOptions, grantablePeople, officeTermList } from '@/modules/governance';
import { organizationList } from '@/modules/identity';
import { territoryOptions } from '@/modules/access';
import { publishedTemplateOptions } from '@/modules/documents';
import {
  AdvanceFileForm,
  BargainingCommissionForm,
  ConsultationForm,
  OpenFileForm,
  ProposalForm,
} from './bargaining-forms';

export const metadata = { title: 'Negociación colectiva', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TIPO: Record<string, string> = {
  COLLECTIVE_AGREEMENT_NEGOTIATION: 'Contrato colectivo',
  CONTRACT_REVIEW: 'Revisión contractual',
  WAGE_REVIEW: 'Revisión salarial',
  COLLECTIVE_DISPUTE: 'Conflicto colectivo',
  STRIKE_PROCEDURE: 'Procedimiento de huelga',
};

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'Abierto', tone: 'neutral' },
  NEGOTIATION: { label: 'En negociación', tone: 'accent' },
  CONSULTATION: { label: 'En consulta', tone: 'accent' },
  CONCILIATION: { label: 'En conciliación', tone: 'warning' },
  STRIKE_PROCEDURE: { label: 'Procedimiento de huelga', tone: 'danger' },
  CONCLUDED: { label: 'Concluido', tone: 'success' },
  ARCHIVED: { label: 'Archivado', tone: 'neutral' },
};

/**
 * Negociación colectiva (PRD §9.7; F5-NEG-001 a F5-NEG-003).
 *
 * Los expedientes de huelga se distinguen a la vista, y con motivo: son los
 * únicos que exigen un acuerdo de asamblea para existir, y la pantalla lo
 * enseña como un dato del expediente, no como una nota al pie.
 */
export default async function NegociacionPage() {
  const actor = await currentActor();

  const [expedientes, territorios, organizaciones, acuerdos, personas, cargos, plantillas] = await Promise.all([
    bargainingFileList(actor),
    territoryOptions(actor),
    organizationList(actor),
    approvedResolutionOptions(actor),
    grantablePeople(actor),
    officeTermList(actor, { onlyLive: true }),
    publishedTemplateOptions(actor, 'REPORT'),
  ]);

  const puedeAdministrar = can({ ...actor, reason: 'negociación colectiva' }, 'bargaining.file.manage', {
    kind: 'BargainingFile',
  }).allowed;
  const puedeConsultar = can({ ...actor, reason: 'consulta a agremiados' }, 'bargaining.consultation.open', {
    kind: 'BargainingFile',
  }).allowed;

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  const opcionesTerritorio: readonly Option[] = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];
  const opcionesOrganizacion: readonly Option[] = organizaciones.ok
    ? organizaciones.data.map((organizacion) => ({ value: organizacion.id, label: organizacion.legalName }))
    : [];
  const opcionesAcuerdo: readonly Option[] = acuerdos.ok
    ? acuerdos.data.map((acuerdo) => ({ value: acuerdo.id, label: acuerdo.label }))
    : [];
  const opcionesPersona: readonly Option[] = personas.ok
    ? personas.data.map((persona) => ({ value: persona.value, label: persona.label }))
    : [];
  const opcionesCargo: readonly Option[] = cargos.ok
    ? cargos.data.map((cargo) => ({ value: cargo.id, label: `${cargo.officeName} · ${cargo.personName}` }))
    : [];
  const opcionesPlantilla: readonly Option[] = plantillas.ok
    ? plantillas.data.map((plantilla) => ({ value: plantilla.value, label: plantilla.label }))
    : [];

  return (
    <PageShell
      title="Negociación colectiva"
      description="Contratos colectivos, revisiones, conflictos y huelga. Un procedimiento de huelga no lo inicia ninguna automatización: exige el acuerdo de la asamblea, y la base lo impone."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Expedientes</h2>
          {!expedientes.ok ? (
            <ErrorNotice title={expedientes.error.message} />
          ) : expedientes.data.length === 0 ? (
            <EmptyState
              title="No hay expedientes abiertos"
              description="Un expediente reúne la negociación, sus propuestas y la consulta a los agremiados afectados."
            />
          ) : (
            <div className="space-y-4">
              {expedientes.data.map((expediente) => {
                const estado = ESTADO[expediente.status] ?? { label: expediente.status, tone: 'neutral' as Tone };
                const esHuelga = expediente.kind === 'STRIKE_PROCEDURE';
                return (
                  <Card key={expediente.id}>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-mono text-sm font-semibold">{expediente.folio}</h3>
                      <Badge tone={estado.tone}>{estado.label}</Badge>
                      <Badge tone={esHuelga ? 'danger' : 'accent'}>{TIPO[expediente.kind] ?? expediente.kind}</Badge>
                      {esHuelga &&
                        (expediente.hasEnablingResolution ? (
                          <Badge tone="success">Con acuerdo de asamblea</Badge>
                        ) : (
                          <Badge tone="danger">Sin acuerdo habilitante</Badge>
                        ))}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {expediente.territory}
                      {expediente.counterpart !== null && ` · contraparte ${expediente.counterpart}`}
                      {expediente.authorityCaseNumber !== null &&
                        ` · autoridad ${expediente.authorityCaseNumber}`}
                      {expediente.closedAt !== null && ` · cerrado el ${fecha.format(expediente.closedAt)}`}
                    </p>

                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Comisión negociadora:</dt>
                        <dd>
                          {expediente.commissionMembers.length === 0
                            ? 'Sin integrar'
                            : expediente.commissionMembers.join(', ')}
                        </dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Propuestas:</dt>
                        <dd className="tabular-nums">{expediente.proposalCount}</dd>
                      </div>
                      {expediente.affectedRosterEntries !== null && (
                        <>
                          <div className="flex flex-wrap gap-x-2">
                            <dt className="font-medium">Agremiados afectados:</dt>
                            <dd className="tabular-nums">{expediente.affectedRosterEntries}</dd>
                          </div>
                          <div className="flex flex-wrap gap-x-2">
                            <dt className="font-medium">Huella del padrón:</dt>
                            <dd className="font-mono text-xs break-all">{expediente.affectedRosterHash}</dd>
                          </div>
                        </>
                      )}
                      {expediente.consultation !== null && (
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium">Consulta:</dt>
                          <dd>
                            {expediente.consultation.title} · {expediente.consultation.status}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {puedeAdministrar && expediente.status !== 'ARCHIVED' && (
                      <div className="mt-4 space-y-3">
                        <Disclosure summary="Integrar la comisión negociadora">
                          <BargainingCommissionForm
                            fileId={expediente.id}
                            personas={opcionesPersona}
                            cargos={opcionesCargo}
                          />
                        </Disclosure>
                        <Disclosure summary="Registrar una propuesta">
                          <ProposalForm fileId={expediente.id} plantillas={opcionesPlantilla} />
                        </Disclosure>
                        {puedeConsultar && expediente.consultation === null && (
                          <Disclosure summary="Abrir la consulta a los agremiados afectados">
                            <ConsultationForm fileId={expediente.id} />
                          </Disclosure>
                        )}
                        <Disclosure summary="Cambiar el estado">
                          <AdvanceFileForm fileId={expediente.id} />
                        </Disclosure>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {puedeAdministrar && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Abrir un expediente</h2>
            <Card>
              <OpenFileForm
                territorios={opcionesTerritorio}
                organizaciones={opcionesOrganizacion}
                acuerdos={opcionesAcuerdo}
              />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
