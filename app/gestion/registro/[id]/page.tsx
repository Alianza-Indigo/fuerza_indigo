import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Card,
  EmptyState,
  ErrorNotice,
  Notice,
  PageShell,
  ScrollableTable,
  Section,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { territoryOptions } from '@/modules/access';
import { findDuplicates, personRecord } from '@/modules/identity';
import { can } from '@/platform/authz/policy';
import { PersonForm } from '../person-form';
import { MergeForm } from './merge-form';

export const metadata = { title: 'Registro maestro', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const RELACIONES: Record<string, string> = {
  PARENT_OR_GUARDIAN: 'Madre, padre o tutor',
  CHILD: 'Hija o hijo',
  SPOUSE_OR_PARTNER: 'Cónyuge o pareja',
  RELATIVE: 'Familiar',
  PRIMARY_CAREGIVER: 'Cuidadora principal',
  SECONDARY_CAREGIVER: 'Cuidadora secundaria',
  AUTHORIZED_REPRESENTATIVE: 'Representante autorizada',
  EMERGENCY_CONTACT: 'Contacto de emergencia',
  RESPONSIBLE_PROFESSIONAL: 'Profesional responsable',
};

const ESTADOS: Record<string, string> = {
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspendida',
  EXPIRED: 'Vencida',
  DISCIPLINARY_PROCESS: 'En proceso disciplinario',
  VOLUNTARY_WITHDRAWAL: 'Baja voluntaria',
  STATUS_LOSS: 'Pérdida de calidad',
  DECEASED: 'Fallecimiento',
  CANCELLED_DUPLICATE: 'Cancelada por duplicidad',
  REGISTERED: 'Registrada',
  IN_ATTENTION: 'En atención',
  REFERRED: 'Canalizada',
  CLOSED: 'Cerrada',
  ARCHIVED: 'Archivada',
};

/**
 * Registro maestro de una persona (PRD §3.1).
 *
 * Presenta separados los bloques que el PRD enumera —identidad, contacto,
 * domicilio, cuenta, calidades, relaciones— sobre un solo registro. Es la
 * pantalla donde se ve, de un vistazo, que una persona puede ser agremiada,
 * familiar de otra y beneficiaria a la vez sin estar tres veces en la base.
 */
export default async function RegistroMaestroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const registro = await personRecord(actor, { personId: id });
  if (!registro.ok) {
    if (registro.error.code === 'NOT_FOUND') notFound();
    return (
      <PageShell title="Registro maestro">
        <ErrorNotice title={registro.error.message} />
      </PageShell>
    );
  }

  const persona = registro.data;
  const puedeEditar = can(actor, 'identity.person.update', { kind: 'Person' }).allowed;
  const puedeFusionar = can(
    { ...actor, reason: 'revisión de duplicidad' },
    'identity.person.merge',
    { kind: 'Person' },
  ).allowed;

  const [duplicados, territorios] = await Promise.all([
    puedeFusionar ? findDuplicates(actor, { personId: id }) : Promise.resolve(null),
    territoryOptions(actor),
  ]);

  const opciones = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];

  const candidatas =
    duplicados !== null && duplicados.ok
      ? duplicados.data.candidates
          .filter((candidata) => !candidata.archived)
          .map((candidata) => ({
            value: candidata.personId,
            label: `${candidata.displayName} · ${candidata.publicId}`,
            hint: `Coincide en ${candidata.matchedOn.join(' y ')}${candidata.hasAccount ? '. Tiene cuenta: se deshabilitará al fusionar.' : ''}`,
          }))
      : [];

  const nombre = [
    persona.identity.givenName,
    persona.identity.middleName,
    persona.identity.familyName,
    persona.identity.secondFamilyName,
  ]
    .filter((parte) => parte !== null && parte !== '')
    .join(' ');

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell title={nombre} description={`Identificador público ${persona.publicId}`}>
      <div className="space-y-8">
        <p>
          <Link href="/gestion/registro" className="underline underline-offset-4">
            ← Volver al registro de personas
          </Link>
        </p>

        {persona.merge.mergedInto !== null && (
          <Notice tone="warning" title="Este registro quedó fusionado con otro">
            <p>
              Se conserva para que su identificador siga resolviendo.{' '}
              <Link href={`/gestion/registro/${persona.merge.mergedInto}`} className="underline underline-offset-4">
                Ir al registro que se conservó
              </Link>
              .
            </p>
          </Notice>
        )}

        {persona.merge.mergedFrom.length > 0 && (
          <Notice tone="neutral" title="Este registro absorbió otros">
            <p>Identificadores anteriores: {persona.merge.mergedFrom.join(', ')}.</p>
          </Notice>
        )}

        <Section title="Calidades" description="Lo que esta persona es hoy dentro del ecosistema.">
          {persona.qualities.length === 0 ? (
            <EmptyState
              title="Sin ninguna calidad todavía"
              description="No es agremiada, ni honoraria, ni está registrada como persona beneficiaria."
            />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Calidad</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {persona.qualities.map((calidad, indice) => (
                  <tr key={`${calidad.kind}-${indice}`} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">{calidad.label}</td>
                    <td className="p-3">{ESTADOS[calidad.status] ?? calidad.status}</td>
                    <td className="p-3 tabular-nums">{formatter.format(calidad.since)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </Section>

        <Section
          title="Relaciones familiares y de cuidado"
          description="Una relación registrada no da acceso a expedientes por sí sola: hace falta además consentimiento vigente."
        >
          {persona.relationships.length === 0 ? (
            <EmptyState title="Sin relaciones registradas" description="Aquí aparecerán cuando se registren." />
          ) : (
            <ul className="space-y-2">
              {persona.relationships.map((relacion) => (
                <li key={relacion.id} className="rounded-lg border border-[var(--color-line)] p-3">
                  <span className="font-medium">{RELACIONES[relacion.kind] ?? relacion.kind}</span>{' '}
                  {relacion.direction === 'DESDE' ? 'de' : 'hacia'} {relacion.otherPersonName}
                  {!relacion.live && (
                    <span className="ml-2 text-sm text-[var(--color-ink-soft)]">(revocada)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Cuenta de acceso">
          <p>
            {persona.account.hasAccount
              ? `Tiene cuenta, en estado ${persona.account.status === 'ACTIVE' ? 'activa' : persona.account.status === 'INVITED' ? 'sin activar' : 'deshabilitada'}.`
              : 'No tiene cuenta. Puede recibir atención igual: una persona beneficiaria no necesita cuenta digital propia.'}
          </p>
        </Section>

        {puedeFusionar && (
          <Section
            title="Posibles duplicidades"
            description="Registros que se parecen a este. Fusionarlos traslada todo lo suyo aquí y deja el duplicado apuntando a este registro."
          >
            <Card>
              <MergeForm keepPersonId={persona.personId} candidatas={candidatas} />
            </Card>
          </Section>
        )}

        {puedeEditar && persona.merge.mergedInto === null && (
          <Section title="Editar los datos">
            <Card>
              <PersonForm
                territorios={opciones}
                valores={{
                  personId: persona.personId,
                  rowVersion: persona.rowVersion,
                  givenName: persona.identity.givenName,
                  middleName: persona.identity.middleName ?? '',
                  familyName: persona.identity.familyName,
                  secondFamilyName: persona.identity.secondFamilyName ?? '',
                  preferredName: persona.identity.preferredName ?? '',
                  birthDate: persona.identity.birthDate ?? '',
                  genderIdentity: persona.identity.genderIdentity,
                  nationality: persona.identity.nationality ?? '',
                  primaryEmail: persona.contact.primaryEmail ?? '',
                  primaryPhone: persona.contact.primaryPhone ?? '',
                  alternateContact: persona.contact.alternateContact ?? '',
                  addressLine: persona.address.addressLine ?? '',
                  postalCode: persona.address.postalCode ?? '',
                  stateCode: persona.address.stateCode ?? '',
                  municipalityCode: persona.address.municipalityCode ?? '',
                  territorialUnitId: persona.address.territorialUnitId ?? '',
                }}
              />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
