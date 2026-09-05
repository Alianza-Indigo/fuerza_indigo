import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Notice,
  PageShell,
  ScrollableTable,
  Section,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { territoryOptions } from '@/modules/access';
import { findDuplicates, personRecord, searchPeople } from '@/modules/identity';
import { careRelationships, relationshipReach } from '@/modules/membership';
import { consentVersionList, personConsents } from '@/platform/consent';
import { can } from '@/platform/authz/policy';
import { PersonForm } from '../person-form';
import { MergeForm } from './merge-form';
import { ALCANCE, RELACION } from '../../afiliacion/etiquetas';
import {
  CareRelationshipForm,
  GrantConsentForm,
  RevokeConsentForm,
  RevokeRelationshipForm,
} from '../../afiliacion/relationship-forms';

export const metadata = { title: 'Registro maestro', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';


const PROPOSITO: Record<string, string> = {
  MEMBERSHIP: 'Afiliación y padrón',
  DIRECTORY_PUBLICATION: 'Publicación en el directorio',
  CASE_PROCESSING: 'Atención de un caso',
  INTER_ENTITY_REFERRAL: 'Canalización entre entidades',
  CIAN_CARE: 'Atención CIAN',
  CLINICAL_DATA_SHARING: 'Compartir datos clínicos',
  AI_ASSISTANCE: 'Asistencia con inteligencia artificial',
  TOOL_IDENTITY_EXCHANGE: 'Identidad en herramientas',
  MARKETING_COMMUNICATIONS: 'Comunicaciones no esenciales',
  EVENT_PARTICIPATION: 'Participación en eventos',
  MINOR_REPRESENTATION: 'Representación de persona menor de edad',
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

  const puedeRelaciones = can(actor, 'membership.relationship.manage', { kind: 'CareRelationship' }).allowed;
  const puedeConsentir = can(actor, 'consent.grant', { kind: 'Consent' }).allowed;
  const puedeVerRelaciones = can(actor, 'membership.relationship.read', { kind: 'CareRelationship' }).allowed;
  const puedeVerConsentimientos = can(actor, 'consent.read', { kind: 'Consent' }).allowed;

  const [duplicados, territorios, relaciones, consentimientos, textos, personas] = await Promise.all([
    puedeFusionar ? findDuplicates(actor, { personId: id }) : Promise.resolve(null),
    territoryOptions(actor),
    puedeVerRelaciones ? careRelationships(actor, { personId: id }) : Promise.resolve(null),
    puedeVerConsentimientos ? personConsents(actor, { personId: id }) : Promise.resolve(null),
    puedeConsentir ? consentVersionList(actor) : Promise.resolve(null),
    puedeRelaciones ? searchPeople(actor, { limit: 200 }) : Promise.resolve(null),
  ]);

  // El alcance efectivo se pregunta relación por relación: es una consulta al
  // consentimiento, no un campo de la fila, y presentarlo como si lo fuera es
  // justo lo que hace creer que la relación ya concede acceso.
  const alcances = new Map<string, { effectiveScope: readonly string[]; blockedBecause: string | null }>();
  if (relaciones !== null && relaciones.ok) {
    const respuestas = await Promise.all(
      relaciones.data.map((relacion) => relationshipReach(actor, { relationshipId: relacion.id })),
    );
    for (const respuesta of respuestas) {
      if (respuesta.ok) {
        alcances.set(respuesta.data.relationshipId, {
          effectiveScope: respuesta.data.effectiveScope,
          blockedBecause: respuesta.data.blockedBecause,
        });
      }
    }
  }

  const opcionesDePersona =
    personas !== null && personas.ok
      ? personas.data
          .filter((otra) => otra.mergedInto === null)
          .map((otra) => ({ value: otra.personId, label: `${otra.displayName} · ${otra.publicId}` }))
      : [];

  // Solo los textos publicados que sirven para consentir algo: ofrecer un aviso
  // informativo aquí llevaría a registrar un consentimiento que el caso de uso
  // va a rechazar, después de haber hecho firmar a alguien.
  const publicados =
    textos !== null && textos.ok
      ? textos.data.filter((texto) => texto.status === 'PUBLISHED' && texto.requiredFor.length > 0)
      : [];
  const textosPublicados = publicados.map((texto) => ({
    value: texto.id,
    label: `${texto.title} (${texto.code} v${texto.version})`,
  }));
  const propositosDisponibles = [...new Set(publicados.flatMap((texto) => texto.requiredFor))].map((uno) => ({
    value: uno,
    label: PROPOSITO[uno] ?? uno,
  }));

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
          description="Lo que una relación alcanza de verdad depende del consentimiento, no de la relación."
        >
          {relaciones === null || !relaciones.ok ? (
            <EmptyState
              title="No tienes facultades para ver las relaciones de esta persona"
              description="Consultar el registro y consultar sus relaciones son cosas distintas."
            />
          ) : relaciones.data.length === 0 ? (
            <EmptyState title="Sin relaciones registradas" description="Aquí aparecerán cuando se registren." />
          ) : (
            <ul className="space-y-3">
              {relaciones.data.map((relacion) => {
                const alcance = alcances.get(relacion.id);
                return (
                  <li key={relacion.id} className="rounded-lg border border-[var(--color-line)] p-4">
                    <p>
                      <span className="font-medium">{RELACION[relacion.kind] ?? relacion.kind}</span>:{' '}
                      {relacion.fromPersonName} → {relacion.toPersonName}
                      {!relacion.live && (
                        <span className="ml-2 text-sm text-[var(--color-ink-soft)]">
                          {relacion.revokedAt === null ? '(fuera de vigencia)' : '(revocada)'}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      Declarada desde el {formatter.format(relacion.startsAt)}
                      {relacion.endsAt !== null && ` hasta el ${formatter.format(relacion.endsAt)}`}.
                    </p>
                    <p className="mt-2 text-sm">
                      <strong>Alcanzaría:</strong>{' '}
                      {relacion.declaredScope.length === 0
                        ? 'nada declarado'
                        : relacion.declaredScope.map((uno) => ALCANCE[uno] ?? uno).join(', ')}
                    </p>
                    <p className="mt-1 text-sm">
                      <strong>Alcanza hoy:</strong>{' '}
                      {alcance === undefined
                        ? '—'
                        : alcance.effectiveScope.length === 0
                          ? `nada. ${alcance.blockedBecause ?? ''}`
                          : alcance.effectiveScope.map((uno) => ALCANCE[uno] ?? uno).join(', ')}
                    </p>
                    {relacion.revokeReason !== null && (
                      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                        Motivo de la revocación: {relacion.revokeReason}
                      </p>
                    )}
                    {relacion.live && puedeRelaciones && (
                      <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                        <Disclosure summary="Revocar esta relación">
                          <RevokeRelationshipForm relationshipId={relacion.id} anchorPersonId={persona.personId} />
                        </Disclosure>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {puedeRelaciones && (
            <Card>
              <h3 className="mb-3 font-semibold">Registrar una relación</h3>
              <CareRelationshipForm anchorPersonId={persona.personId} personas={opcionesDePersona} />
            </Card>
          )}
        </Section>

        <Section
          title="Consentimientos"
          description="Lo que esta persona autorizó, sobre qué texto y hasta cuándo. Revocar surte efecto desde ahora, no hacia atrás."
        >
          {consentimientos === null || !consentimientos.ok ? (
            <EmptyState
              title="No tienes facultades para ver los consentimientos de esta persona"
              description="Son datos sensibles y se consultan con permiso propio."
            />
          ) : consentimientos.data.length === 0 ? (
            <EmptyState
              title="Sin consentimientos registrados"
              description="Ninguna relación alcanza expedientes mientras esto siga vacío."
            />
          ) : (
            <ul className="space-y-3">
              {consentimientos.data.map((consentimiento) => (
                <li key={consentimiento.id} className="rounded-lg border border-[var(--color-line)] p-4">
                  <p className="font-medium">{PROPOSITO[consentimiento.purpose] ?? consentimiento.purpose}</p>
                  <p className="mt-1 text-sm">{consentimiento.text}</p>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    Otorgado el {formatter.format(consentimiento.grantedAt)}
                    {consentimiento.grantedByOwn ? ' por la propia persona' : ' por representación acreditada'}
                    {consentimiento.expiresAt !== null && `, vence el ${formatter.format(consentimiento.expiresAt)}`}
                    {consentimiento.revokedAt !== null &&
                      `. Revocado el ${formatter.format(consentimiento.revokedAt)}: ${consentimiento.revokeReason ?? ''}`}
                    {consentimiento.live ? '.' : ''}
                  </p>
                  {consentimiento.live && puedeConsentir && (
                    <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                      <Disclosure summary="Revocar este consentimiento">
                        <RevokeConsentForm consentId={consentimiento.id} personId={persona.personId} />
                      </Disclosure>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puedeConsentir && (
            <Card>
              <h3 className="mb-3 font-semibold">Registrar un consentimiento</h3>
              <GrantConsentForm
                personId={persona.personId}
                textos={textosPublicados}
                propositos={propositosDisponibles}
                relaciones={
                  relaciones !== null && relaciones.ok
                    ? relaciones.data
                        .filter((relacion) => relacion.live && relacion.toPersonId === persona.personId)
                        .map((relacion) => ({
                          value: relacion.id,
                          label: `${RELACION[relacion.kind] ?? relacion.kind} · ${relacion.fromPersonName}`,
                        }))
                    : []
                }
              />
            </Card>
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
