import Link from 'next/link';
import { Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { formatDateTime } from '@/platform/i18n/format';
import { myDirectoryState } from '@/modules/membership';
import { PreferenceForm, WithdrawForm } from './directory-forms';

export const metadata = { title: 'Mi ficha pública', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Lo que cada persona decide sobre su aparición pública (PRD §7.3).
 *
 * La pantalla empieza diciendo **cómo estás hoy**, no ofreciendo opciones: la
 * primera pregunta de quien entra aquí es «¿salgo o no salgo?», y responderla
 * antes de nada evita que alguien cambie su configuración solo para averiguarlo.
 */
export default async function MiDirectorioPage() {
  const actor = await currentActor();
  if (actor.personId === null) {
    return (
      <PageShell title="Mi ficha pública">
        <ErrorNotice title="Para decidir sobre tu ficha necesitas entrar con tu cuenta." />
      </PageShell>
    );
  }

  const estado = await myDirectoryState(actor, actor.personId);
  if (!estado.ok) {
    return (
      <PageShell title="Mi ficha pública">
        <ErrorNotice title={estado.error.message} />
      </PageShell>
    );
  }

  const publicada = estado.data.publishedSlug !== null;

  return (
    <PageShell
      title="Mi ficha pública"
      description="Tú decides si apareces en el directorio público y con cuánto. Nadie te publica sin que lo digas."
    >
      <div className="space-y-8">
        <Section title="Cómo estás hoy">
          {!publicada ? (
            // Si hubo un retiro, se acusa aquí y no dentro del formulario de
            // retirar: ese formulario desaparece con el retiro —ya no queda
            // nada que retirar— y se llevaría el acuse por delante (defecto
            // `D-F4-015`). El acuse sale del hecho registrado, así que
            // sobrevive a la recarga y a volver mañana.
            estado.data.withdrawnAt !== null ? (
              <Notice tone="success" title="Retiramos tu autorización">
                <p>
                  Tu ficha salió del directorio público el {formatDateTime(estado.data.withdrawnAt)}. Ya no se ve
                  desde fuera y se avisó a los buscadores para que la quiten de sus resultados.
                </p>
                <p>Si algún día quieres volver a aparecer, elige abajo cuánto quieres que se vea.</p>
              </Notice>
            ) : (
              <Notice tone="neutral" title="No apareces en el directorio público">
                <p>Nadie de fuera de la organización te encuentra ahí. Es lo que pasa si no haces nada.</p>
              </Notice>
            )
          ) : (
            <Notice
              tone="success"
              title={
                estado.data.indexable
                  ? 'Tu ficha está publicada y los buscadores pueden indexarla'
                  : 'Tu ficha está publicada, sin indexación por buscadores'
              }
            >
              <p>
                Se ve en{' '}
                <Link
                  href={`/directorio/${estado.data.publishedSlug}`}
                  className="underline underline-offset-4"
                >
                  /directorio/{estado.data.publishedSlug}
                </Link>
                .
              </p>
            </Notice>
          )}
        </Section>

        <Section title="Qué se publica de ti">
          <Card>
            <PreferenceForm
              visibility={estado.data.visibility}
              showPhoto={estado.data.showPhoto}
              showProfessionalContact={estado.data.showProfessionalContact}
              allowSearchEngineIndexing={estado.data.allowSearchEngineIndexing}
            />
          </Card>
        </Section>

        {publicada && (
          <Section
            title="Retirar mi ficha"
            description="Surte efecto en el momento. La ficha desaparece y se le avisa a los buscadores."
          >
            <Card>
              <WithdrawForm />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
