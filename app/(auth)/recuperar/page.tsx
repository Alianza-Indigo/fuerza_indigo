import { AuthShell } from '@/design-system/primitives';
import { RequestResetForm } from './reset-forms';

export const metadata = { title: 'Recuperar contraseña' };

export default function RecoverPage() {
  return (
    <AuthShell
      title="Recuperar contraseña"
      description="Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva."
    >
      <RequestResetForm />
    </AuthShell>
  );
}
