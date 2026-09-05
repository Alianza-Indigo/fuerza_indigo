import { redirect } from 'next/navigation';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { SECCIONES } from './secciones';

export const dynamic = 'force-dynamic';

/**
 * Punto de entrada del panel institucional.
 *
 * Lleva a la primera sección alcanzable de verdad, tomada de la misma lista que
 * dibuja la navegación.
 */
export default async function InstitucionalIndexPage() {
  const actor = await currentActor();
  const sondeo = { ...actor, reason: 'acceso al panel institucional' };

  const primera = SECCIONES.find((seccion) => can(sondeo, seccion.permiso, { kind: 'Institucional' }).allowed);

  redirect(primera?.href ?? '/mi/seguridad');
}
