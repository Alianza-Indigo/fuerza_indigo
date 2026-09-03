import { redirect } from 'next/navigation';
import { AuthShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { RootLoginForm } from './root-login-form';

export const metadata = { title: 'Acceso de Superadmin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RootLoginPage() {
  const actor = await currentActor();
  if (actor.actorKind === 'ROOT_SUPERADMIN') redirect('/superadmin');

  return (
    <AuthShell
      title="Acceso técnico"
      description="Esta ruta es para la administración técnica del sistema. No concede derechos sindicales ni acceso a expedientes."
    >
      <RootLoginForm />
    </AuthShell>
  );
}
