import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, ErrorNotice, Notice, PageShell, Prose, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { beneficiaryDetail } from '@/modules/membership';
import { searchPeople } from '@/modules/identity';
import { territoryOptions } from '@/modules/access';
import { can } from '@/platform/authz/policy';
import { ESTADO_DE_ATENCION, ORIGEN, PRIVACIDAD, URGENCIA } from '../../etiquetas';
import { BeneficiaryManageForm, CloseBeneficiaryForm } from './manage-forms';

export const metadata = { title: 'Atención', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Expediente de una atención protegida (PRD §3.4).
 *
 * La necesidad inicial se muestra aquí y no en el listado: lo que alguien contó
 * de su vida se lee cuando se va a hacer algo con ello, no de pasada al recorrer
 * una tabla.
 */
export default async function AtencionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const expediente = await beneficiaryDetail(actor, id);
  if (!expediente.ok) {
    if (expediente.error.code === 'NOT_FOUND') notFound();
    return (
      <PageShell title="Atención">
        <ErrorNotice title={expediente.error.message} />
      </PageShell>
    );
  }

  const fila = expediente.data;

  const puedeActualizar = can(actor, 'membership.beneficiary.update', {
    kind: 'ProtectedBeneficiary',
    id: fila.id,
  }).allowed;

  const [personas, territorios] = puedeActualizar
    ? await Promise.all([searchPeople(actor, { limit: 200 }), territoryOptions(actor)])
    : [null, null];

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const cerrada = fila.status === 'CLOSED' || fila.status === 'ARCHIVED';

  return (
    <PageShell title={fila.personName} description={`Atención ${fila.publicId} · ${fila.legalEntity}`}>
      <div className="space-y-8">
        <p>
          <Link href="/gestion/afiliacion/beneficiarios" className="underline underline-offset-4">
            ← Volver al registro
          </Link>
          {' · '}
          <Link href={`/gestion/registro/${fila.personId}`} className="underline underline-offset-4">
            Ver el registro maestro de la persona
          </Link>
        </p>

        <Notice tone="neutral" title="Esta calidad no afilia ni cobra">
          <p>
            No concede derechos electorales, no genera cuota y no entra en el padrón que se remite a la
            autoridad laboral. Puede convivir con cualquier otra calidad de la misma persona.
          </p>
        </Notice>

        <Section title="Situación">
          <p className="flex flex-wrap gap-2">
            <Badge
              tone={fila.urgencyLevel === 'URGENT' ? 'danger' : fila.urgencyLevel === 'PRIORITY' ? 'warning' : 'neutral'}
            >
              {URGENCIA[fila.urgencyLevel] ?? fila.urgencyLevel}
            </Badge>
            <Badge tone="accent">{ESTADO_DE_ATENCION[fila.status] ?? fila.status}</Badge>
            <Badge tone={fila.privacyLevel === 'REINFORCED' ? 'success' : 'neutral'}>
              Privacidad {PRIVACIDAD[fila.privacyLevel]?.toLowerCase() ?? fila.privacyLevel}
            </Badge>
          </p>
          <dl className="mt-4 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
            <div className="p-4">
              <dt className="font-medium">Por dónde llegó</dt>
              <dd className="mt-1 text-[var(--color-ink-soft)]">{ORIGEN[fila.originKind] ?? fila.originKind}</dd>
            </div>
            <div className="p-4">
              <dt className="font-medium">Territorio</dt>
              <dd className="mt-1 text-[var(--color-ink-soft)]">{fila.territory ?? 'Sin especificar'}</dd>
            </div>
            <div className="p-4">
              <dt className="font-medium">Persona responsable</dt>
              <dd className="mt-1 text-[var(--color-ink-soft)]">
                {fila.responsiblePersonName ?? 'Ninguna registrada'}
              </dd>
            </div>
            <div className="p-4">
              <dt className="font-medium">Cuenta digital</dt>
              <dd className="mt-1 text-[var(--color-ink-soft)]">
                {fila.hasDigitalAccount
                  ? 'Tiene cuenta propia.'
                  : 'Sin cuenta propia, y no le hace falta: la atención no la exige.'}
              </dd>
            </div>
            <div className="p-4">
              <dt className="font-medium">Registrada</dt>
              <dd className="mt-1 text-[var(--color-ink-soft)]">{fecha.format(fila.registeredAt)}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Con qué necesita ayuda" description="Tal como se contó.">
          {fila.privacyLevel === 'REINFORCED' && (
            <Notice tone="neutral" title="Esta lectura queda registrada">
              <p>
                El expediente tiene privacidad reforzada: no aparece en listados ni en exportaciones, y cada
                vez que alguien lo abre queda constancia de quién fue y cuándo.
              </p>
            </Notice>
          )}
          <Prose>
            <p className="whitespace-pre-wrap">{fila.initialNeed}</p>
          </Prose>
        </Section>

        {puedeActualizar && !cerrada && (
          <>
            <Section title="Seguimiento">
              <Card>
                <BeneficiaryManageForm
                  beneficiaryId={fila.id}
                  personas={
                    personas !== null && personas.ok
                      ? personas.data
                          .filter((persona) => persona.mergedInto === null && persona.personId !== fila.personId)
                          .map((persona) => ({
                            value: persona.personId,
                            label: `${persona.displayName} · ${persona.publicId}`,
                          }))
                      : []
                  }
                  territorios={
                    territorios !== null && territorios.ok
                      ? territorios.data.map((unidad) => ({
                          value: unidad.id,
                          label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
                        }))
                      : []
                  }
                  actual={{
                    urgencyLevel: fila.urgencyLevel,
                    status: fila.status,
                    territorialUnitId: '',
                    responsiblePersonId: '',
                    privacyLevel: fila.privacyLevel,
                  }}
                />
              </Card>
            </Section>

            <Section title="Cerrar la atención">
              <Card>
                <CloseBeneficiaryForm beneficiaryId={fila.id} />
              </Card>
            </Section>
          </>
        )}

        {cerrada && (
          <Notice tone="neutral" title="Esta atención está cerrada">
            <p>Si la persona vuelve, se abre una nueva. El historial se conserva.</p>
          </Notice>
        )}
      </div>
    </PageShell>
  );
}
