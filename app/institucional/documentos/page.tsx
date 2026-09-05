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
import { templateList } from '@/modules/documents';
import { listLegalEntities } from '@/modules/admin';
import { DraftTemplateForm, PublishTemplateForm, RetireTemplateForm } from './template-forms';

export const metadata = { title: 'Plantillas de documento', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PUBLISHED: { label: 'Publicada', tone: 'success' },
  RETIRED: { label: 'Retirada', tone: 'warning' },
};

const TIPO: Record<string, string> = {
  MEMBERSHIP_RESOLUTION: 'Resolución de afiliación',
  CREDENTIAL: 'Credencial',
  ASSEMBLY_MINUTES: 'Acta de asamblea',
  CALL_NOTICE: 'Convocatoria',
  ELECTION_RESULT: 'Acta de resultados',
  DISCIPLINARY_DECISION: 'Resolución disciplinaria',
  POWER_GRANT: 'Poder',
  RECEIPT: 'Recibo',
  CERTIFICATE: 'Constancia',
  ATTENDANCE_CONSTANCY: 'Constancia de asistencia',
  REPORT: 'Informe',
};

/**
 * Plantillas versionadas de documento (PRD §16.2).
 *
 * Una plantilla publicada no se edita: se publica otra versión. Por eso la
 * pantalla enseña la lista completa de versiones y no solo la vigente. Saber
 * con qué versión se emitió un acta es lo que permite reconstruirla.
 */
export default async function PlantillasPage() {
  const actor = await currentActor();

  const [plantillas, entidades] = await Promise.all([templateList(actor), listLegalEntities(actor)]);

  const opcionesEntidad: readonly Option[] = entidades.ok
    ? entidades.data.map((entidad) => ({ value: entidad.id, label: entidad.shortName }))
    : [];

  return (
    <PageShell
      title="Plantillas de documento"
      description="Convocatorias, actas, poderes y resoluciones se emiten desde una plantilla versionada. La versión publicada no se edita: se publica otra, y lo ya emitido conserva la suya."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Versiones</h2>
          {!plantillas.ok ? (
            <ErrorNotice title={plantillas.error.message} />
          ) : plantillas.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna plantilla"
              description="Sin plantilla publicada no se puede emitir ningún documento institucional."
            />
          ) : (
            <ScrollableTable caption="Plantillas de documento por código y versión">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Plantilla</th>
                  <th scope="col" className="p-3 font-medium">Tipo</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Emitidos</th>
                  <th scope="col" className="p-3 font-medium">Variables</th>
                  <th scope="col" className="p-3 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {plantillas.data.map((plantilla) => {
                  const estado = ESTADO[plantilla.status] ?? { label: plantilla.status, tone: 'neutral' as Tone };
                  return (
                    <tr key={plantilla.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                      <td className="p-3">
                        <span className="font-medium">{plantilla.name}</span>
                        <span className="block font-mono text-xs text-[var(--color-ink-soft)]">
                          {plantilla.code} v{plantilla.version}
                        </span>
                        {plantilla.numberingSeries !== null && (
                          <span className="block text-xs text-[var(--color-ink-soft)]">
                            serie {plantilla.numberingSeries}
                          </span>
                        )}
                      </td>
                      <td className="p-3">{TIPO[plantilla.kind] ?? plantilla.kind}</td>
                      <td className="p-3">
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                      </td>
                      <td className="p-3 tabular-nums">{plantilla.issuedCount}</td>
                      <td className="p-3">
                        <span className="font-mono text-xs">{plantilla.variables.join(', ')}</span>
                      </td>
                      <td className="p-3">
                        {plantilla.status === 'DRAFT' && (
                          <Disclosure summary="Publicar">
                            <PublishTemplateForm templateId={plantilla.id} version={plantilla.version} />
                          </Disclosure>
                        )}
                        {plantilla.status === 'PUBLISHED' && (
                          <Disclosure summary="Retirar">
                            <RetireTemplateForm templateId={plantilla.id} />
                          </Disclosure>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Redactar una versión</h2>
          <Card>
            <DraftTemplateForm entidades={opcionesEntidad} />
          </Card>
        </section>
      </div>
    </PageShell>
  );
}
