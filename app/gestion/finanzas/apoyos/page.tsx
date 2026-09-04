import { Badge, Card, Disclosure, EmptyState, ErrorNotice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { billableEntities, catalogList, discountList, scholarshipList } from '@/modules/billing';
import { can } from '@/platform/authz/policy';
import { formatMoney } from '@/platform/i18n';
import {
  ApproveScholarshipForm,
  GrantDiscountForm,
  RevokeDiscountForm,
  RevokeScholarshipForm,
} from './forms';

export const metadata = { title: 'Descuentos y becas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PROGRAMA: Record<string, string> = {
  MEMBERSHIP: 'Cuotas y membresía',
  CIAN_SERVICE: 'Servicios del CIAN',
  COURSE: 'Cursos y programas',
  TOOL_ACCESS: 'Acceso a herramientas',
};

/**
 * Descuentos y becas (F3-PAG-006).
 *
 * Las dos cosas responden a la misma pregunta —cuánto deja de cobrar la
 * organización y por qué— y por eso viven en la misma pantalla. Pero se
 * presentan separadas, porque no son lo mismo: un descuento es una condición
 * comercial que alcanza a quien la cumpla, y una beca es una decisión sobre una
 * persona concreta que no puede pagar.
 *
 * La justificación de una beca solo se ve aquí, y solo la ve quien tiene el
 * permiso sensible que la protege.
 */
export default async function ApoyosPage() {
  const actor = await currentActor();
  const sondeo = { ...actor, reason: 'consulta de descuentos y becas' };

  const [descuentos, becas, entidades, conceptos] = await Promise.all([
    discountList(actor),
    scholarshipList(actor),
    billableEntities(actor),
    catalogList(actor),
  ]);

  const puedeOtorgar = can(sondeo, 'billing.discount.manage', { kind: 'DiscountGrant' }).allowed;
  const puedeBecar = can(sondeo, 'billing.scholarship.manage', { kind: 'Scholarship' }).allowed;


  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const fecha = new Intl.DateTimeFormat(actor.locale, { dateStyle: 'medium', timeZone: actor.timeZone });

  const opcionesDeEntidad = entidades.ok
    ? entidades.data.map((entidad) => ({ id: entidad.id, label: entidad.shortName }))
    : [];
  const opcionesDeConcepto = conceptos.ok
    ? conceptos.data.map((concepto) => ({ id: concepto.id, label: `${concepto.name} (${concepto.code})` }))
    : [];

  return (
    <PageShell
      title="Descuentos y becas"
      description="Lo que la organización deja de cobrar, y por qué. Todo con fecha, motivo y quien lo autorizó."
      width="ancha"
    >
      <div className="space-y-10">
        <Section
          title="Descuentos, cupones y convenios"
          level={2}
          description="Alcanzan a quien cumpla la condición. Un descuento retirado deja de aplicarse pero no desaparece."
        >
          {!descuentos.ok ? (
            <ErrorNotice title={descuentos.error.message} />
          ) : descuentos.data.length === 0 ? (
            <EmptyState
              title="No hay ningún descuento"
              description="Cuando la organización acuerde un convenio o un precio especial, se registra aquí y rebaja lo que se cobra."
            />
          ) : (
            <div className="space-y-4">
              {descuentos.data.map((fila) => (
                <Card key={fila.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{fila.name}</h3>
                      <p className="text-sm text-[var(--color-ink-soft)]">
                        {fila.legalEntityShortName}
                        {fila.code !== null && (
                          <>
                            {' · '}
                            <span className="font-mono text-xs">{fila.code}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums">
                        {fila.kind === 'FULL_WAIVER'
                          ? 'Exención total'
                          : fila.kind === 'PERCENTAGE'
                            ? `${String(fila.value)} %`
                            : formatMoney(BigInt(fila.value), 'MXN', formato)}
                      </p>
                      <Badge tone={fila.vigente ? 'success' : 'neutral'}>
                        {fila.revokedAt !== null ? 'Retirado' : fila.vigente ? 'Vigente' : 'Fuera de vigencia'}
                      </Badge>
                    </div>
                  </div>

                  <p className="mt-3 text-sm">
                    {fila.productNames.length === 0
                      ? 'Alcanza a todos los conceptos de la entidad.'
                      : `Alcanza a: ${fila.productNames.join(', ')}.`}
                  </p>
                  <p className="mt-1 text-sm tabular-nums text-[var(--color-ink-soft)]">
                    Desde {fecha.format(fila.validFrom)}
                    {fila.validTo !== null && ` hasta ${fecha.format(fila.validTo)}`} · usado {fila.redemptions}{' '}
                    {fila.redemptions === 1 ? 'vez' : 'veces'}
                    {fila.maxRedemptions !== null && ` de ${String(fila.maxRedemptions)}`}
                  </p>

                  {puedeOtorgar && fila.revokedAt === null && (
                    <div className="mt-4">
                      <RevokeDiscountForm discountGrantId={fila.id} />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Section>

        {puedeOtorgar && opcionesDeEntidad.length > 0 && (
          <Section title="Otorgar un descuento" level={2}>
            <Card>
              <GrantDiscountForm entidades={opcionesDeEntidad} conceptos={opcionesDeConcepto} />
            </Card>
          </Section>
        )}

        {becas.ok ? (
          <Section
            title="Becas y exenciones"
            level={2}
            description="Cada una dice algo sobre la situación de una persona. Lo que aparece aquí no sale de aquí."
          >
            {becas.data.length === 0 ? (
              <EmptyState
                title="No hay ninguna beca otorgada"
                description="Una beca se otorga cuando alguien no puede pagar y la organización lo acredita. Se registra aquí, con su justificación y su evidencia."
              />
            ) : (
              <div className="space-y-4">
                {becas.data.map((fila) => (
                  <Card key={fila.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">{fila.personName}</h3>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          {fila.legalEntityShortName} · {PROGRAMA[fila.programKind] ?? fila.programKind}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold tabular-nums">
                          {fila.coveragePercent === 100 ? 'Exención total' : `${String(fila.coveragePercent)} %`}
                        </p>
                        <Badge tone={fila.vigente ? 'success' : 'neutral'}>
                          {fila.revokedAt !== null ? 'Retirada' : fila.vigente ? 'Vigente' : 'Fuera de vigencia'}
                        </Badge>
                      </div>
                    </div>

                    <p className="mt-1 text-sm tabular-nums text-[var(--color-ink-soft)]">
                      Desde {fecha.format(fila.validFrom)}
                      {fila.validTo !== null && ` hasta ${fecha.format(fila.validTo)}`} · {fila.evidenceCount}{' '}
                      {fila.evidenceCount === 1 ? 'evidencia' : 'evidencias'}
                    </p>

                    <div className="mt-4">
                      <Disclosure summary="Ver la justificación">
                        <p className="max-w-[var(--width-prose)] whitespace-pre-line">{fila.justification}</p>
                      </Disclosure>
                    </div>

                    {puedeBecar && fila.revokedAt === null && (
                      <div className="mt-4">
                        <RevokeScholarshipForm scholarshipId={fila.id} />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Section>
        ) : null}

        {puedeBecar && opcionesDeEntidad.length > 0 && (
          <Section
            title="Aprobar una beca"
            level={2}
            description="Una beca gana a cualquier descuento y no se acumula con ellos: el motivo por el que alguien paga menos tiene que ser uno solo y explicable."
          >
            <Card>
              <ApproveScholarshipForm entidades={opcionesDeEntidad} />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
