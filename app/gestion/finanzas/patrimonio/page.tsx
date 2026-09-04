import { Badge, Card, EmptyState, ErrorNotice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { assetRegister, billableEntities } from '@/modules/billing';
import { can } from '@/platform/authz/policy';
import { formatMoney, todayInZone } from '@/platform/i18n';
import { MoveAssetForm, RegisterAssetForm } from './forms';

export const metadata = { title: 'Patrimonio', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TIPO: Record<string, string> = {
  REAL_ESTATE: 'Inmueble',
  VEHICLE: 'Vehículo',
  EQUIPMENT: 'Equipo',
  FURNITURE: 'Mobiliario',
  BANK_ACCOUNT: 'Cuenta bancaria',
  INTANGIBLE: 'Intangible',
  OTHER: 'Otro',
};

const MOVIMIENTO: Record<string, string> = {
  REGISTERED: 'Alta',
  REVALUED: 'Revaluación',
  TRANSFERRED: 'Transferencia',
  ASSIGNED: 'Asignación',
  DISPOSED: 'Disposición',
  WRITTEN_OFF: 'Baja',
};

const ESTADO: Record<string, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  ACTIVE: { label: 'En el patrimonio', tone: 'success' },
  IN_REPAIR: { label: 'En reparación', tone: 'accent' },
  TRANSFERRED: { label: 'Transferido', tone: 'neutral' },
  DISPOSED: { label: 'Fuera del patrimonio', tone: 'neutral' },
  LOST: { label: 'Extraviado', tone: 'danger' },
};

/**
 * Registro patrimonial (F3-LIB-003).
 *
 * Cada bien enseña su historia completa, y cada movimiento el acuerdo del que
 * salió. Es lo que convierte una lista de cosas en una rendición de cuentas:
 * el patrimonio de un sindicato es de sus agremiados, y lo que hay que poder
 * responder no es qué hay, sino quién autorizó cada cambio.
 */
export default async function PatrimonioPage() {
  const actor = await currentActor();
  const sondeo = { ...actor, reason: 'consulta del registro patrimonial' };

  const [bienes, entidades] = await Promise.all([assetRegister(actor), billableEntities(actor)]);

  const puedeAdministrar = can(sondeo, 'billing.asset.manage', { kind: 'AssetRegister' }).allowed;

  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const fecha = new Intl.DateTimeFormat(actor.locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const hoy = todayInZone(actor.timeZone);

  const opcionesDeEntidad = entidades.ok
    ? entidades.data.map((entidad) => ({ id: entidad.id, label: entidad.shortName }))
    : [];

  const total = bienes.ok
    ? bienes.data
        .filter((bien) => bien.status !== 'DISPOSED')
        .reduce((suma, bien) => suma + bien.documentedValueMinor, 0n)
    : 0n;

  return (
    <PageShell
      title="Patrimonio"
      description="Lo que la organización tiene, con la historia de cada bien y el acuerdo que respalda cada movimiento."
      width="ancha"
    >
      <div className="space-y-10">
        {bienes.ok && bienes.data.length > 0 && (
          <Card>
            <p className="text-sm text-[var(--color-ink-soft)]">Valor documentado de lo que sigue en el patrimonio</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{formatMoney(total, 'MXN', formato)}</p>
          </Card>
        )}

        <Section title="Bienes" level={2}>
          {!bienes.ok ? (
            <ErrorNotice title={bienes.error.message} />
          ) : bienes.data.length === 0 ? (
            <EmptyState
              title="El registro patrimonial está vacío"
              description="Cuando la organización adquiera o reciba un bien, se registra aquí con su valor documentado y su historia."
            />
          ) : (
            <div className="space-y-4">
              {bienes.data.map((bien) => {
                const estado = ESTADO[bien.status] ?? { label: bien.status, tone: 'neutral' as const };
                return (
                  <Card key={bien.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">{bien.name}</h3>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          {TIPO[bien.assetKind] ?? bien.assetKind} · {bien.legalEntityShortName}
                          {bien.location !== null && ` · ${bien.location}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold tabular-nums">
                          {formatMoney(bien.documentedValueMinor, bien.currency, formato)}
                        </p>
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                      </div>
                    </div>

                    <p className="mt-3 max-w-[var(--width-prose)]">{bien.description}</p>
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                      Adquirido el {fecha.format(bien.acquiredOn)}
                      {bien.custodianName !== null && ` · custodia: ${bien.custodianName}`}
                    </p>

                    <div className="mt-4">
                      <h4 className="font-medium">Historia</h4>
                      <ul className="mt-2 space-y-2">
                        {bien.movements.map((movimiento) => (
                          <li key={movimiento.id} className="rounded-lg border border-[var(--color-line)] p-3">
                            <p className="font-medium">
                              {MOVIMIENTO[movimiento.movementKind] ?? movimiento.movementKind}
                              <span className="ml-2 font-normal tabular-nums text-[var(--color-ink-soft)]">
                                {fecha.format(movimiento.occurredOn)}
                              </span>
                            </p>
                            {movimiento.amountMinor !== null && (
                              <p className="text-sm tabular-nums">
                                {formatMoney(movimiento.amountMinor, bien.currency, formato)}
                              </p>
                            )}
                            {movimiento.authorizingResolutionNote !== null && (
                              <p className="mt-1 text-sm">{movimiento.authorizingResolutionNote}</p>
                            )}
                            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                              Registrado por {movimiento.registeredBy} · {movimiento.evidenceCount}{' '}
                              {movimiento.evidenceCount === 1 ? 'documento' : 'documentos'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {puedeAdministrar && bien.status !== 'DISPOSED' && (
                      <div className="mt-4">
                        <MoveAssetForm assetId={bien.id} hoy={hoy} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </Section>

        {puedeAdministrar && opcionesDeEntidad.length > 0 && (
          <Section
            title="Registrar un bien"
            level={2}
            description="El alta queda como el primer movimiento de su historia, para que el bien nunca tenga un momento del que nadie responde."
          >
            <Card>
              <RegisterAssetForm entidades={opcionesDeEntidad} hoy={hoy} />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
