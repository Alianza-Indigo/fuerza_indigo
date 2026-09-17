import { AuthShell } from '@/design-system/primitives';
import { RequestResetForm } from './reset-forms';

export const metadata = { title: 'Entrar a tu cuenta' };

/**
 * Sirve para dos situaciones que la gente vive distinto y el sistema resuelve
 * igual: olvidaste tu contraseña, o nunca llegaste a crearla porque el enlace
 * de tu registro se perdió o venció. En los dos casos se manda un enlace nuevo
 * y el anterior deja de valer.
 */
export default function RecoverPage() {
  return (
    <AuthShell
      title="Entrar a tu cuenta"
      description="Escribe tu correo y te mandamos un enlace para elegir tu contraseña. Sirve igual si la olvidaste que si nunca llegaste a crearla porque no te llegó el enlace de tu registro o ya venció."
    >
      <RequestResetForm />
    </AuthShell>
  );
}
