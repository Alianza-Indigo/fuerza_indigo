import { Badge, Card, ErrorNotice, ForbiddenNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { readProviderConfig } from '@/modules/ai';
import { ProviderForm } from './provider-form';

export const metadata = { title: 'Proveedor de IA', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Centavos a una cadena de pesos con dos decimales, para prellenar el formulario. */
function centavosAPesos(minor: bigint): string {
  const negativo = minor < 0n;
  const abs = negativo ? -minor : minor;
  return `${negativo ? '-' : ''}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/**
 * Gobernanza del proveedor de IA (PRD §15.1; criterio 5 de la fase, a la vista).
 *
 * Desde aquí se encienden y se bajan los límites sin desplegar, y la salud dice
 * el estado real: operativa, o degradada con su motivo. Apagada no es una
 * avería, y la pantalla lo dice así.
 */
export default async function ProveedorPage() {
  const actor = await currentActor();
  // `ai.provider.configure` exige motivo (permiso crítico). El guardián de la
  // pantalla lo lleva, igual que la navegación y el propio caso de uso: sin él,
  // `can` niega aunque la persona tenga la facultad, y la pantalla se convertiría
  // en una denegación para quien sí puede.
  const sonda = { ...actor, reason: 'abrir la configuración del proveedor de IA' };
  if (!can(sonda, 'ai.provider.configure', { kind: 'AiProviderConfiguration', legalEntityId: null }).allowed) {
    return (
      <PageShell title="Proveedor de IA">
        <ForbiddenNotice />
      </PageShell>
    );
  }

  const config = await readProviderConfig(actor);

  return (
    <PageShell
      title="Proveedor de IA"
      description="Modelos, límites, techo de gasto y encendido. Lo que cuesta la IA se controla desde aquí, sin desplegar."
      width="lectura"
    >
      {!config.ok ? (
        <ErrorNotice title={config.error.message} />
      ) : (
        <div className="space-y-8">
          <Section title="Estado" level={2}>
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={config.data.health.capability === 'OPERATIONAL' ? 'success' : 'warning'}>
                  {config.data.health.capability === 'OPERATIONAL' ? 'Operativa' : 'Degradada'}
                </Badge>
                <span className="text-sm text-[var(--color-ink-soft)]">{config.data.health.detail}</span>
              </div>
              {config.data.health.capability !== 'OPERATIONAL' && (
                <Notice title="La aplicación sigue funcionando" tone="accent" live="none">
                  <p>
                    Con la IA degradada, los flujos asistidos operan por el camino humano. No es una avería: es un estado
                    de operación legítimo.
                  </p>
                </Notice>
              )}
            </Card>
          </Section>

          <Section title="Configuración" level={2}>
            <Card>
              <ProviderForm
                config={{
                  defaultModel: config.data.defaultModel,
                  allowedModels: config.data.allowedModels,
                  maxTokensPerRequest: config.data.maxTokensPerRequest,
                  maxRequestsPerUserPerDay: config.data.maxRequestsPerUserPerDay,
                  maxMonthlyCostPesos: centavosAPesos(config.data.maxMonthlyCostMinor),
                  currency: config.data.currency,
                  trainingOptOut: config.data.trainingOptOut,
                  isEnabled: config.data.isEnabled,
                  apiKeyEnvVarName: config.data.apiKeyEnvVarName,
                }}
              />
            </Card>
          </Section>
        </div>
      )}
    </PageShell>
  );
}
