import Link from 'next/link';
import { Badge, Card, ErrorNotice, PageShell } from '@/design-system/primitives';
import { listLegalEntities, startupStatus } from '@/modules/admin';
import { currentActor } from '@/platform/http/request-context';
import { LegalEntityForm } from './legal-entity-form';

export const metadata = { title: 'Puesta en marcha', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const steps = [
  {
    key: 'legalEntityReady' as const,
    title: '1. Completar Fuerza Índigo',
    description: 'Registra domicilio y RFC o número de registro sindical en esta misma pantalla.',
    href: '#ficha-institucional',
    action: 'Completar ficha',
  },
  {
    key: 'membershipNoticeReady' as const,
    title: '2. Publicar el aviso de afiliación',
    description: 'La solicitud pública no recaba CURP mientras su aviso específico siga en borrador.',
    href: '/gestion/consentimientos',
    action: 'Revisar y publicar avisos',
  },
  {
    key: 'publicNoticeReady' as const,
    title: '3. Publicar el aviso de ayuda y contacto',
    description: 'El canal Necesitas ayuda tampoco recibe datos hasta que su aviso esté publicado.',
    href: '/gestion/consentimientos',
    action: 'Revisar y publicar avisos',
  },
  {
    key: 'rulesReady' as const,
    title: '4. Poner en vigor las reglas iniciales',
    description: 'Completa los umbrales reales y acredita el acta constitutiva o estatuto fuente.',
    href: '/institucional/reglas',
    action: 'Completar reglas',
  },
  {
    key: 'executiveSecretaryReady' as const,
    title: '5. Nombrar la primera Secretaría Ejecutiva',
    description: 'Primero invita su cuenta y luego otorga el nombramiento para Fuerza Índigo.',
    href: '/gestion/personas',
    action: 'Invitar primera cuenta',
  },
] as const;

export default async function StartupPage() {
  const actor = await currentActor();
  const [status, entities] = await Promise.all([startupStatus(actor), listLegalEntities(actor)]);

  if (!status.ok) {
    return <PageShell title="Puesta en marcha"><ErrorNotice title={status.error.message} /></PageShell>;
  }

  const fuerza = entities.ok ? entities.data.find((entity) => entity.code === 'FUERZA_INDIGO') : undefined;
  const ready = steps.every((step) => status.data[step.key]);

  return (
    <PageShell
      title="Puesta en marcha"
      description="Los actos indispensables para que una instalación nueva pueda recibir solicitudes, crear expedientes y operar con cuentas institucionales."
    >
      <div className="space-y-8">
        <Card tone={ready ? 'success' : undefined}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={ready ? 'success' : 'warning'}>{ready ? 'Operación habilitada' : 'Configuración pendiente'}</Badge>
            <p className="text-sm">
              {ready
                ? 'Fuerza Índigo ya tiene los datos y facultades mínimos para operar.'
                : 'Completa los pasos en orden; cada candado explica qué hecho institucional falta.'}
            </p>
          </div>
        </Card>

        <ol className="grid gap-4 md:grid-cols-2">
          {steps.map((step) => {
            const done = status.data[step.key];
            return (
              <li key={step.key}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{step.title}</h2>
                    <Badge tone={done ? 'success' : 'warning'}>{done ? 'Listo' : 'Pendiente'}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{step.description}</p>
                  <Link href={done && step.key === 'executiveSecretaryReady' ? '/gestion/nombramientos' : step.href} className="mt-3 inline-block text-sm underline underline-offset-4">
                    {done ? 'Revisar' : step.action}
                  </Link>
                  {step.key === 'executiveSecretaryReady' && !done && status.data.people > 0 && (
                    <span className="ml-4 text-sm">
                      <Link href="/gestion/nombramientos" className="underline underline-offset-4">Ya invité la cuenta: nombrarla</Link>
                    </span>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Alta de miembros</h2>
          <Card>
            <p className="text-sm">
              Hay {status.data.applications} solicitud(es) y {status.data.memberships} membresía(s) vigentes o suspendidas.
            </p>
            {status.data.rulesReady ? (
              <Link href="/gestion/afiliacion/solicitudes" className="mt-3 inline-block underline underline-offset-4">
                Abrir o revisar solicitudes de afiliación
              </Link>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                El alta se habilita cuando las reglas iniciales entren en vigor; así cada solicitud conserva la versión que aceptó.
              </p>
            )}
          </Card>
        </section>

        <section id="ficha-institucional" className="scroll-mt-6">
          <h2 className="mb-3 text-lg font-semibold">Ficha institucional de Fuerza Índigo</h2>
          {fuerza === undefined ? (
            <ErrorNotice title={entities.ok ? 'No existe la entidad Fuerza Índigo.' : entities.error.message} />
          ) : (
            <Card><LegalEntityForm entity={fuerza} /></Card>
          )}
        </section>
      </div>
    </PageShell>
  );
}
