import Link from 'next/link';
import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  ForbiddenNotice,
  PageShell,
  ScrollableTable,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { assemblyList, resolutionList } from '@/modules/assembly';
import { electionList } from '@/modules/election';
import { officeTermList, ruleSetList } from '@/modules/governance';

export const metadata = { title: 'Archivo histórico', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TIPO_ASAMBLEA: Record<string, string> = {
  ORDINARY: 'Ordinaria',
  EXTRAORDINARY: 'Extraordinaria',
  SECTIONAL: 'Seccional',
};

/**
 * Archivo histórico institucional (PRD §9.9; F5-GOB-005).
 *
 * No guarda nada nuevo: **reúne lo que ya consta** —las versiones estatutarias,
 * los cargos con su periodo, las asambleas con su acta, las resoluciones y los
 * procesos electorales— y lo ordena en el tiempo. Un archivo que copia la
 * información en una tabla propia empieza a divergir de la original en cuanto
 * alguien corrige algo, y entonces deja de servir para lo único que sirve:
 * saber qué pasó.
 *
 * Se compone con las consultas públicas de cada módulo, no con consultas
 * cruzadas: cada una vuelve a evaluar su permiso, así que quien mira ve
 * exactamente lo que le corresponde y no un resumen que se lo salta.
 */
export default async function ArchivoPage() {
  const actor = await currentActor();

  const decision = can({ ...actor, reason: 'consulta del archivo histórico' }, 'compliance.archive.read', {
    kind: 'Archivo',
  });
  if (!decision.allowed) {
    return (
      <PageShell title="Archivo histórico">
        <ForbiddenNotice />
      </PageShell>
    );
  }

  const [versiones, cargos, asambleas, resoluciones, elecciones] = await Promise.all([
    ruleSetList(actor),
    officeTermList(actor),
    assemblyList(actor),
    resolutionList(actor),
    electionList(actor),
  ]);

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Archivo histórico"
      description="Qué acordó la institución, cuándo, con qué reglas y quién ocupaba cada cargo. Todo se lee del registro original: aquí no hay una segunda copia que pueda divergir."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Versiones estatutarias</h2>
          {!versiones.ok ? (
            <ErrorNotice title={versiones.error.message} />
          ) : versiones.data.length === 0 ? (
            <EmptyState title="Sin versiones registradas" description="La primera versión se redacta desde reglas estatutarias." />
          ) : (
            <ScrollableTable caption="Versiones de reglas estatutarias">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Versión</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Vigencia</th>
                  <th scope="col" className="p-3 font-medium">Acuerdo</th>
                </tr>
              </thead>
              <tbody>
                {versiones.data.map((version) => (
                  <tr key={version.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3 font-mono">{version.version}</td>
                    <td className="p-3">
                      <Badge tone={version.status === 'IN_FORCE' ? 'success' : 'neutral'}>
                        {version.status}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums">
                      {version.effectiveFrom === null ? 'Sin entrar en vigor' : fecha.format(version.effectiveFrom)}
                      {version.effectiveTo !== null && ` — ${fecha.format(version.effectiveTo)}`}
                    </td>
                    <td className="p-3">{version.approvedByResolution ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Quién ocupó cada cargo</h2>
          {!cargos.ok ? (
            <ErrorNotice title={cargos.error.message} />
          ) : cargos.data.length === 0 ? (
            <EmptyState title="Sin periodos registrados" description="Los cargos son registros históricos: aquí aparecen todos, vigentes y concluidos." />
          ) : (
            <ScrollableTable caption="Periodos de cargo, del más reciente al más antiguo">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Cargo</th>
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Periodo</th>
                  <th scope="col" className="p-3 font-medium">Acceso</th>
                </tr>
              </thead>
              <tbody>
                {cargos.data.map((cargo) => (
                  <tr key={cargo.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      {cargo.officeName}
                      <span className="block text-xs text-[var(--color-ink-soft)]">{cargo.bodyName}</span>
                    </td>
                    <td className="p-3">{cargo.personName}</td>
                    <td className="p-3 tabular-nums">
                      {fecha.format(cargo.startsOn)} — {fecha.format(cargo.endsOn)}
                      {cargo.endedEarlyOn !== null && (
                        <span className="block text-xs text-[var(--color-ink-soft)]">
                          concluido el {fecha.format(cargo.endedEarlyOn)}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {cargo.accessLive ? <Badge tone="success">Vivo</Badge> : <Badge tone="neutral">Retirado</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Asambleas</h2>
          {!asambleas.ok ? (
            <ErrorNotice title={asambleas.error.message} />
          ) : asambleas.data.length === 0 ? (
            <EmptyState title="Sin asambleas" description="Aparecerán con su convocatoria, su quórum y su acta." />
          ) : (
            <ScrollableTable caption="Asambleas celebradas y convocadas">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Sesión</th>
                  <th scope="col" className="p-3 font-medium">Cuándo</th>
                  <th scope="col" className="p-3 font-medium">Reglas</th>
                  <th scope="col" className="p-3 font-medium">Quórum</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {asambleas.data.map((asamblea) => (
                  <tr key={asamblea.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      <Link
                        href={`/institucional/asambleas/${asamblea.publicId}`}
                        className="underline underline-offset-4"
                      >
                        {TIPO_ASAMBLEA[asamblea.type] ?? asamblea.type}
                      </Link>
                      <span className="block text-xs text-[var(--color-ink-soft)]">
                        {asamblea.bodyName} · {asamblea.territory}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums">{fecha.format(asamblea.scheduledAt)}</td>
                    <td className="p-3 font-mono text-xs">{asamblea.normativeVersion}</td>
                    <td className="p-3">
                      {asamblea.quorumDeclaredAt === null ? (
                        <span className="text-[var(--color-ink-soft)]">Sin declarar</span>
                      ) : (
                        <Badge tone="success">Declarado</Badge>
                      )}
                    </td>
                    <td className="p-3">{asamblea.status}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Resoluciones</h2>
          {!resoluciones.ok ? (
            <ErrorNotice title={resoluciones.error.message} />
          ) : resoluciones.data.length === 0 ? (
            <EmptyState title="Sin resoluciones" description="Los acuerdos de la asamblea aparecerán aquí con su número." />
          ) : (
            <div className="space-y-2">
              {resoluciones.data.map((resolucion) => (
                <Card key={resolucion.id}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-semibold">{resolucion.number}</span>
                    <Badge tone={resolucion.outcome === 'APPROVED' ? 'success' : 'neutral'}>{resolucion.outcome}</Badge>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      Asamblea {resolucion.assemblyPublicId} del {fecha.format(resolucion.assemblyScheduledAt)}
                    </span>
                  </div>
                  <Disclosure summary="Texto">
                    <p className="whitespace-pre-line text-sm">{resolucion.text}</p>
                  </Disclosure>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Procesos electorales</h2>
          {!elecciones.ok ? (
            <ErrorNotice title={elecciones.error.message} />
          ) : elecciones.data.length === 0 ? (
            <EmptyState title="Sin procesos electorales" description="Aparecerán con su comisión, su padrón y sus resultados." />
          ) : (
            <ScrollableTable caption="Procesos electorales">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Proceso</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Padrón publicado</th>
                  <th scope="col" className="p-3 font-medium">Planillas</th>
                </tr>
              </thead>
              <tbody>
                {elecciones.data.map((proceso) => (
                  <tr key={proceso.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">
                      <Link
                        href={`/institucional/elecciones/${proceso.publicId}`}
                        className="underline underline-offset-4"
                      >
                        {proceso.name}
                      </Link>
                      <span className="block text-xs text-[var(--color-ink-soft)]">
                        {proceso.bodyName} · {proceso.territory}
                      </span>
                    </td>
                    <td className="p-3">{proceso.status}</td>
                    <td className="p-3 tabular-nums">
                      {proceso.rosterPublishedAt === null ? '—' : fecha.format(proceso.rosterPublishedAt)}
                    </td>
                    <td className="p-3 tabular-nums">{proceso.slateCount}</td>
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
