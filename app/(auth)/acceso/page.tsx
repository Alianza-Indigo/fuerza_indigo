import { redirect } from 'next/navigation';
import { AuthShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { isAuthenticated } from '@/platform/kernel/actor-context';
import { LoginForm } from './login-form';

export const metadata = { title: 'Iniciar sesión' };
export const dynamic = 'force-dynamic';

export default async function AccessPage() {
  const actor = await currentActor();
  if (isAuthenticated(actor)) redirect('/mi/seguridad');

  return (
    <AuthShell
      title="Iniciar sesión"
      description="Entra con el correo con el que te dieron de alta en la plataforma."
      footer={
        <p className="text-[var(--color-ink-soft)]">
          ¿Aún no tienes cuenta? Las cuentas se crean por invitación de tu delegación o de la Secretaría de
          Organización.
        </p>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
