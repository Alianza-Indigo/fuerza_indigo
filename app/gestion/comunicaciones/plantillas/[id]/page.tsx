import { notFound } from 'next/navigation';
import { Badge, Card, ForbiddenNotice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { notificationTemplateDetail } from '@/modules/notifications';
import { CANAL, CLASE, ESTADO_DE_PLANTILLA } from '../etiquetas';
import { PublishTemplate, RetireTemplate } from './template-lifecycle';

export const metadata = { title: 'Plantilla de aviso', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PlantillaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const detalle = await notificationTemplateDetail(actor, id);
  if (!detalle.ok) {
    if (detalle.error.code === 'FORBIDDEN') {
      return (
        <PageShell title="Plantilla de aviso">
          <ForbiddenNotice />
        </PageShell>
      );
    }
    notFound();
  }

  const plantilla = detalle.data;
  const estado = ESTADO_DE_PLANTILLA[plantilla.status];

  // Sonda con motivo: publicar exige motivo, así que preguntar «¿podría esta
  // persona publicar?» con el actor pelado —cuyo motivo es siempre nulo— negaría
  // a todos y el formulario no aparecería nunca. El motivo real lo captura el
  // formulario y lo vuelve a validar el caso de uso.
  const sonda = { ...actor, reason: 'consulta del panel de plantillas de aviso' };
  const puedePublicar = can(sonda, 'notifications.template.publish', { kind: 'NotificationTemplate', legalEntityId: null }).allowed;

  return (
    <PageShell title={`${plantilla.code} · v${plantilla.version}`} description={`${CANAL[plantilla.channel]} · ${CLASE[plantilla.category]} · ${plantilla.locale}`} width="ancha">
      <div className="space-y-8">
        <Section title="Estado">
          <Badge tone={estado.tone}>{estado.label}</Badge>
        </Section>

        <Section title="Contenido">
          <Card>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-[var(--color-ink-soft)]">Asunto</dt>
                <dd className="mt-1">{plantilla.subject ?? <span className="text-[var(--color-ink-soft)]">Sin asunto</span>}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-[var(--color-ink-soft)]">Cuerpo</dt>
                <dd className="mt-1 whitespace-pre-wrap rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-sunken)] p-3 font-mono text-sm">
                  {plantilla.bodyTemplate}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-[var(--color-ink-soft)]">Variables declaradas</dt>
                <dd className="mt-1">
                  {plantilla.variables.length === 0 ? (
                    <span className="text-[var(--color-ink-soft)]">Ninguna</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {plantilla.variables.map((nombre) => (
                        <Badge key={nombre} tone="neutral">{`{{${nombre}}}`}</Badge>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        </Section>

        {puedePublicar && plantilla.status === 'DRAFT' && (
          <Section title="Publicar" description="Deja de ser borrador y empieza a usarse. Retira la versión publicada anterior del mismo código.">
            <Card>
              <PublishTemplate templateId={plantilla.id} />
            </Card>
          </Section>
        )}

        {puedePublicar && plantilla.status === 'PUBLISHED' && (
          <Section title="Retirar" description="Deja de usarse. Para cambiar el texto, redacta una versión nueva en vez de retirar esta.">
            <Card>
              <RetireTemplate templateId={plantilla.id} />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
