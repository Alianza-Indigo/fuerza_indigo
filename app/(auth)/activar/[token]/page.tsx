import { AuthShell } from '@/design-system/primitives';
import { ActivationForm } from '../activation-form';

export const metadata = { title: 'Establecer contraseña' };

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <AuthShell
      title="Establece tu contraseña"
      description="Elige una contraseña para entrar a la plataforma de Fuerza Índigo."
    >
      <ActivationForm token={token} />
    </AuthShell>
  );
}
