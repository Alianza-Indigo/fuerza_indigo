import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { beneficiaryDetail } from '@/modules/membership';
import { searchPeople } from '@/modules/identity';
import { territoryOptions } from '@/modules/access';
import { can } from '@/platform/authz/policy';
import {
  ESTADO_DE_REGISTRO_PROTEGIDO,
  MOTIVO_REVOCACION,
  ORIGEN,
  PERFIL_PROTEGIDO,
  PRIVACIDAD,
} from '../../etiquetas';
import { BeneficiaryManageForm, RestoreBeneficiaryForm, RevokeBeneficiaryForm } from './manage-forms';

export const metadata = { title: 'Registro protegido', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RegistroProtegidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  const resultado = await beneficiaryDetail(actor, id);
  if (!resultado.ok) {
    if (resultado.error.code === 'NOT_FOUND') notFound();
    return <PageShell title="Registro protegido"><ErrorNotice title={resultado.error.message} /></PageShell>;
  }
  const fila = resultado.data;
  const recurso = {
    kind: 'ProtectedBeneficiary',
    id: fila.id,
    legalEntityId: fila.legalEntityId,
    territorialPath: fila.territorialPath,
  };
  const puedeActualizar = fila.status === 'ACTIVE' && can(actor, 'membership.beneficiary.update', recurso).allowed;
  const puedeRevocar = fila.status === 'ACTIVE' && can(
    { ...actor, reason: 'comprobar disponibilidad de la acción' },
    'membership.beneficiary.revoke',
    recurso,
  ).allowed;
  const puedeRestaurar = fila.status === 'REVOKED' && actor.actorKind === 'ROOT_SUPERADMIN';
  const [personas, territorios] = puedeActualizar
    ? await Promise.all([searchPeople(actor, { limit: 200 }), territoryOptions(actor)])
    : [null, null];
  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell title={fila.personName} description={`Registro ${fila.publicId} · ${fila.legalEntity}`}>
      <div className="space-y-8">
        <p>
          <Link href="/gestion/afiliacion/beneficiarios" className="underline underline-offset-4">← Volver al registro</Link>
          {' · '}
          <Link href={`/gestion/registro/${fila.personId}`} className="underline underline-offset-4">Ver persona</Link>
          {' · '}
          <Link href="/casos" className="underline underline-offset-4">Ver expedientes de atención</Link>
        </p>

        <Notice tone="neutral" title="El registro y la atención son cosas distintas">
          <p>Esta ficha acredita la calidad protegida. Cada solicitud de ayuda se trabaja y se cierra en su propio expediente; cerrar un expediente no revoca esta ficha.</p>
        </Notice>

        <Section title="Situación">
          <p className="flex flex-wrap gap-2">
            <Badge tone={fila.status === 'ACTIVE' ? 'success' : 'danger'}>
              {ESTADO_DE_REGISTRO_PROTEGIDO[fila.status] ?? fila.status}
            </Badge>
            <Badge tone={fila.privacyLevel === 'REINFORCED' ? 'success' : 'neutral'}>
              Privacidad {PRIVACIDAD[fila.privacyLevel]?.toLowerCase() ?? fila.privacyLevel}
            </Badge>
          </p>
          <dl className="mt-4 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
            <Info label="Perfil" value={PERFIL_PROTEGIDO[fila.profileKind] ?? fila.profileKind} />
            <Info label="Origen" value={ORIGEN[fila.originKind] ?? fila.originKind} />
            <Info label="Territorio" value={fila.territory ?? 'Sin especificar'} />
            <Info label="Persona responsable" value={fila.responsiblePersonName ?? 'Ninguna registrada'} />
            <Info label="Cuenta digital" value={fila.hasDigitalAccount ? 'Sí' : 'No; no es requisito para recibir apoyo'} />
            <Info label="Embajador Índigo" value={fila.promoterReference ?? 'Registro sin embajador'} />
            <Info label="Credencial física" value={fila.physicalCredentialRequested ? 'Solicitada' : 'No solicitada'} />
            <Info label="Registrada" value={fecha.format(fila.registeredAt)} />
          </dl>
        </Section>

        {fila.status === 'REVOKED' && (
          <Notice tone="danger" title="Registro revocado">
            <p>{fila.revocationReasonKind === null ? '' : `${MOTIVO_REVOCACION[fila.revocationReasonKind] ?? fila.revocationReasonKind}. `}{fila.revocationReason}</p>
            {fila.revokedAt !== null && <p>Revocado el {fecha.format(fila.revokedAt)}.</p>}
          </Notice>
        )}

        {puedeActualizar && (
          <Section title="Actualizar ficha"><Card><BeneficiaryManageForm
            beneficiaryId={fila.id}
            personas={personas !== null && personas.ok ? personas.data
              .filter((persona) => persona.mergedInto === null && persona.personId !== fila.personId)
              .map((persona) => ({ value: persona.personId, label: `${persona.displayName} · ${persona.publicId}` })) : []}
            territorios={territorios !== null && territorios.ok ? territorios.data.map((unidad) => ({
              value: unidad.id,
              label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
            })) : []}
            actual={{
              profileKind: fila.profileKind,
              territorialUnitId: fila.territorialUnitId ?? '',
              responsiblePersonId: fila.responsiblePersonId ?? '',
              privacyLevel: fila.privacyLevel,
            }}
          /></Card></Section>
        )}
        {puedeRevocar && <Section title="Revocar registro"><Card><RevokeBeneficiaryForm beneficiaryId={fila.id} /></Card></Section>}
        {puedeRestaurar && <Section title="Restaurar registro"><Card><RestoreBeneficiaryForm beneficiaryId={fila.id} /></Card></Section>}
      </div>
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="p-4"><dt className="font-medium">{label}</dt><dd className="mt-1 text-[var(--color-ink-soft)]">{value}</dd></div>;
}
