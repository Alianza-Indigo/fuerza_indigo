import { AuthShell } from '@/design-system/primitives';
import { ActivationForm } from '../activation-form';

export const metadata = { title: 'Activar cuenta' };

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <AuthShell
      title="Activa tu cuenta"
      description="Elige una contraseña para entrar a la plataforma de Fuerza Índigo."
    >
      <ActivationForm token={token} />
    </AuthShell>
  );
}
