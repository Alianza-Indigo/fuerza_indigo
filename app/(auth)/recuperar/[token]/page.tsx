import { AuthShell } from '@/design-system/primitives';
import { CompleteResetForm } from '../reset-forms';

export const metadata = { title: 'Elegir contraseña nueva' };

export default async function CompleteResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <AuthShell
      title="Elige tu contraseña nueva"
      description="Al guardarla cerraremos todas tus sesiones abiertas."
    >
      <CompleteResetForm token={token} />
    </AuthShell>
  );
}
