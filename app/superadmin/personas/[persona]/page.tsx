import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { getPerson360 } from '@/modules/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Persona 360', robots: { index: false, follow: false } };

function formatDate(value: Date | null): string {
  if (value === null) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(value);
}

function formatDateTime(value: Date | null): string {
  if (value === null) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function money(amountMinor: string, currency: string): string {
  const value = Number(amountMinor) / 100;
  return Number.isFinite(value)
    ? new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(value)
    : `${amountMinor} ${currency}`;
}

export default async function Person360Page({
  params,
  searchParams,
}: {
  params: Promise<{ persona: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ persona }, query] = await Promise.all([params, searchParams]);
  const actor = await currentActor();
  const viewAs = query['modo'] === 'ver-como';

  const result = await getPerson360(actor, persona, viewAs ? 'VIEW_AS' : 'PERSON_360');
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    return (
      <PageShell title="Persona 360">
        <ErrorNotice title={result.error.message} />
      </PageShell>
    );
  }

  const data = result.data;

  if (viewAs) {
    return (
      <PageShell
        title={`Ver como · ${data.identity.displayName}`}
        description="Vista administrativa de solo lectura. Sigues actuando como Superadmin; no se suplanta la identidad de la persona."
      >
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge tone="warning">Modo solo lectura</Badge>
                <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                  Esta vista reproduce la información que la persona encontraría en su experiencia personal, sin ejecutar acciones en su nombre.
                </p>
              </div>
              <Link
                href={`/superadmin/personas/${data.identity.publicId}`}
                className="font-medium underline underline-offset-4"
              >
                Volver a Persona 360
              </Link>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Mi cuenta</h2>
              <dl className="mt-3 grid gap-2 text-sm">
                <Row label="Nombre" value={data.identity.displayName} />
                <Row label="Correo" value={data.account?.email ?? data.identity.primaryEmail ?? '—'} />
                <Row label="Estado" value={data.account?.status ?? 'Sin cuenta digital'} />
                <Row label="Último acceso" value={formatDateTime(data.account?.lastLoginAt ?? null)} />
              </dl>
            </Card>

            <Card>
              <h2 className="font-semibold">Mi afiliación</h2>
              {data.memberships.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--color-ink-soft)]">No hay membresías activas o históricas.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {data.memberships.map((item) => (
                    <li key={item.id} className="rounded-lg border border-[var(--color-line)] p-3">
                      <span className="font-medium">{item.type}</span>
                      <span className="block text-[var(--color-ink-soft)]">
                        {item.memberNumber} · {item.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold">Mi credencial</h2>
              {data.credentials.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--color-ink-soft)]">No hay credenciales emitidas.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {data.credentials.map((item) => (
                    <li key={item.id}>
                      <span className="font-medium">{item.kind}</span> · {item.status} · vence {formatDate(item.expiresAt)}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold">Mis pagos</h2>
              {data.payments.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--color-ink-soft)]">No hay pagos registrados.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {data.payments.slice(0, 10).map((item) => (
                    <li key={item.id}>
                      {money(item.amountMinor, item.currency)} · {item.status} · {formatDate(item.paidAt ?? item.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold">Mis notificaciones</h2>
              {data.notifications.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--color-ink-soft)]">No hay notificaciones.</p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm">
                  {data.notifications.slice(0, 10).map((item) => (
                    <li key={item.id}>
                      <span className="font-medium">{item.title}</span>
                      <span className="block text-[var(--color-ink-soft)]">{item.body}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold">Mis casos</h2>
              {data.cases.filter((item) => item.canViewCase).length === 0 ? (
                <p className="mt-3 text-sm text-[var(--color-ink-soft)]">No hay expedientes visibles para la persona.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {data.cases.filter((item) => item.canViewCase).map((item) => (
                    <li key={item.participationId}>
                      <span className="font-medium">{item.folio}</span> · {item.status}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={data.identity.displayName}
      description="Vista 360° administrativa de identidad, relaciones, cuenta y actividad dentro de la plataforma."
      width="ancha"
    >
      <div className="space-y-8">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={data.identity.archivedAt === null ? 'success' : 'neutral'}>
                  {data.identity.archivedAt === null ? 'Registro activo' : 'Archivado'}
                </Badge>
                {data.account !== null && (
                  <Badge tone={data.account.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    Cuenta {data.account.status}
                  </Badge>
                )}
              </div>
              <p className="mt-3 font-mono text-xs text-[var(--color-ink-soft)]">{data.identity.publicId}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/superadmin/personas/${data.identity.publicId}?modo=ver-como`}
                className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-line)] px-4 py-2 font-medium no-underline hover:bg-[var(--color-indigo-50)]"
              >
                Ver como esta persona
              </Link>
              <Link
                href="/superadmin/personas"
                className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 underline underline-offset-4"
              >
                Volver a personas
              </Link>
            </div>
          </div>
        </Card>

        <section id="identidad">
          <h2 className="mb-3 text-lg font-semibold">Identidad y contacto</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <dl className="grid gap-2 text-sm">
                <Row label="Nombre" value={data.identity.displayName} />
                <Row label="Nombre preferido" value={data.identity.preferredName ?? '—'} />
                <Row label="CURP" value={data.identity.curp ?? '—'} />
                <Row label="Fecha de nacimiento" value={formatDate(data.identity.birthDate)} />
                <Row label="Género" value={data.identity.genderIdentity} />
                <Row label="Nacionalidad" value={data.identity.nationality ?? '—'} />
                <Row label="Territorio" value={data.identity.territory ?? '—'} />
              </dl>
            </Card>
            <Card>
              <dl className="grid gap-2 text-sm">
                <Row label="Correo" value={data.identity.primaryEmail ?? '—'} />
                <Row label="Teléfono" value={data.identity.primaryPhone ?? '—'} />
                <Row label="Contacto alterno" value={data.identity.alternateContact ?? '—'} />
                <Row label="Domicilio" value={data.identity.addressLine ?? '—'} />
                <Row label="Código postal" value={data.identity.postalCode ?? '—'} />
                <Row label="Estado" value={data.identity.stateCode ?? '—'} />
                <Row label="Municipio" value={data.identity.municipalityCode ?? '—'} />
              </dl>
            </Card>
          </div>
        </section>

        <section id="cuenta">
          <h2 className="mb-3 text-lg font-semibold">Cuenta y roles</h2>
          {data.account === null ? (
            <EmptyState title="Sin cuenta digital" description="La persona existe en el registro, pero no tiene cuenta de acceso." />
          ) : (
            <div className="space-y-4">
              <Card>
                <dl className="grid gap-2 text-sm md:grid-cols-2">
                  <Row label="Correo de acceso" value={data.account.email} />
                  <Row label="Estado" value={data.account.status} />
                  <Row label="Correo verificado" value={formatDateTime(data.account.emailVerifiedAt)} />
                  <Row label="Último acceso" value={formatDateTime(data.account.lastLoginAt)} />
                  <Row label="Contraseña creada" value={data.account.hasPassword ? 'Sí' : 'No'} />
                  <Row label="Sesiones activas" value={String(data.account.activeSessions)} />
                </dl>
              </Card>
              {data.roles.length > 0 && (
                <ScrollableTable caption="Roles y nombramientos de la persona">
                  <thead>
                    <tr className="border-b border-[var(--color-line)] text-left">
                      <th className="p-3">Rol</th>
                      <th className="p-3">Entidad</th>
                      <th className="p-3">Territorio</th>
                      <th className="p-3">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.roles.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="p-3 font-medium">{item.role}</td>
                        <td className="p-3">{item.legalEntity ?? item.organization ?? '—'}</td>
                        <td className="p-3">{item.territories.join(', ') || '—'}</td>
                        <td className="p-3">{formatDate(item.startsAt)} — {formatDate(item.endsAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </ScrollableTable>
              )}
            </div>
          )}
        </section>

        <GridSection title="Afiliación" empty={data.applications.length === 0 && data.memberships.length === 0}>
          {data.applications.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold">Solicitud {item.folio}</p>
              <p className="mt-1 text-sm">{item.type} · {item.status}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">{item.legalEntity}</p>
            </Card>
          ))}
          {data.memberships.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold">{item.type}</p>
              <p className="mt-1 text-sm">{item.memberNumber} · {item.status}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">
                {item.legalEntity} · desde {formatDate(item.startedAt)}
              </p>
            </Card>
          ))}
        </GridSection>

        <GridSection title="Beneficiarios y relaciones" empty={data.beneficiaries.length === 0 && data.representedBeneficiaries.length === 0}>
          {data.beneficiaries.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold">Beneficiario protegido</p>
              <p className="mt-1 text-sm">{item.status} · urgencia {item.urgency}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">Privacidad {item.privacyLevel}</p>
            </Card>
          ))}
          {data.representedBeneficiaries.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold">Responsable de {item.name}</p>
              <p className="mt-1 text-sm">{item.status}</p>
              <p className="font-mono text-xs text-[var(--color-ink-soft)]">{item.publicId}</p>
            </Card>
          ))}
        </GridSection>

        <GridSection title="Credenciales y directorio" empty={data.credentials.length === 0 && data.directoryPreferences.length === 0}>
          {data.credentials.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold">{item.kind}</p>
              <p className="mt-1 text-sm">{item.publicCode} · {item.status}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">Vence {formatDate(item.expiresAt)}</p>
            </Card>
          ))}
          {data.directoryPreferences.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold">Directorio: {item.visibility}</p>
              <p className="mt-1 text-sm">Indexación: {item.allowSearchEngineIndexing ? 'permitida' : 'no permitida'}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">Otorgado {formatDate(item.grantedAt)}</p>
            </Card>
          ))}
        </GridSection>

        <section id="consentimientos">
          <h2 className="mb-3 text-lg font-semibold">Consentimientos</h2>
          {data.consents.length === 0 ? (
            <EmptyState title="Sin consentimientos" />
          ) : (
            <ScrollableTable caption="Consentimientos de la persona">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th className="p-3">Propósito</th>
                  <th className="p-3">Texto</th>
                  <th className="p-3">Otorgado</th>
                  <th className="p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.consents.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">{item.purpose}</td>
                    <td className="p-3">{item.title} · v{item.version}</td>
                    <td className="p-3">{formatDate(item.grantedAt)}</td>
                    <td className="p-3">{item.revokedAt === null ? 'Vigente' : 'Revocado'}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section id="pagos">
          <h2 className="mb-3 text-lg font-semibold">Pagos</h2>
          {data.payments.length === 0 ? (
            <EmptyState title="Sin pagos" />
          ) : (
            <ScrollableTable caption="Pagos asociados a la persona">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th className="p-3">Referencia</th>
                  <th className="p-3">Importe</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3 font-mono text-xs">{item.publicId}</td>
                    <td className="p-3">{money(item.amountMinor, item.currency)}</td>
                    <td className="p-3">{item.status}</td>
                    <td className="p-3">{formatDateTime(item.paidAt ?? item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section id="casos">
          <h2 className="mb-3 text-lg font-semibold">Casos y acompañamiento</h2>
          {data.cases.length === 0 ? (
            <EmptyState title="Sin expedientes relacionados" />
          ) : (
            <ScrollableTable caption="Expedientes en los que participa la persona">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th className="p-3">Folio</th>
                  <th className="p-3">Dominio</th>
                  <th className="p-3">Papel</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Acceso</th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((item) => (
                  <tr key={item.participationId} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">
                      <Link href={`/casos/${item.publicId}`} className="font-medium underline underline-offset-4">
                        {item.folio}
                      </Link>
                    </td>
                    <td className="p-3">{item.domain}</td>
                    <td className="p-3">{item.role}</td>
                    <td className="p-3">{item.status}</td>
                    <td className="p-3">{item.canViewCase ? 'Visible para la persona' : 'Solo institucional'}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <GridSection title="Documentos" empty={data.documents.length === 0 && data.signedDocuments.length === 0}>
          {data.documents.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold">{item.template}</p>
              <p className="mt-1 text-sm">{item.folio ?? item.publicId} · {item.status}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">{item.subjectKind} · {formatDate(item.issuedAt)}</p>
            </Card>
          ))}
          {data.signedDocuments.map((item) => (
            <Card key={item.signatureId}>
              <p className="font-semibold">Firmó: {item.template}</p>
              <p className="mt-1 text-sm">{item.folio ?? item.publicId} · {item.signatureKind}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">{formatDate(item.signedAt)}</p>
            </Card>
          ))}
        </GridSection>

        <section id="notificaciones">
          <h2 className="mb-3 text-lg font-semibold">Notificaciones recientes</h2>
          {data.notifications.length === 0 ? (
            <EmptyState title="Sin notificaciones" />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.notifications.map((item) => (
                <Card key={item.id}>
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm">{item.body}</p>
                  <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                    {item.category} · {formatDateTime(item.createdAt)} · {item.readAt === null ? 'No leída' : 'Leída'}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="auditoria">
          <h2 className="mb-3 text-lg font-semibold">Auditoría relacionada</h2>
          {data.audit.length === 0 ? (
            <EmptyState title="Sin eventos relacionados" />
          ) : (
            <ScrollableTable caption="Eventos de auditoría relacionados directamente con la persona">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th className="p-3">Cuándo</th>
                  <th className="p-3">Acción</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">{formatDateTime(item.occurredAt)}</td>
                    <td className="p-3 font-mono text-xs">{item.action}</td>
                    <td className="p-3">{item.actorLabel}</td>
                    <td className="p-3">{item.outcome}</td>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3">
      <dt className="text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function GridSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {empty ? (
        <EmptyState title={`Sin ${title.toLowerCase()}`} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </section>
  );
}
