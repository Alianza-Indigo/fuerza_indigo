import { redirect } from 'next/navigation';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';

export const dynamic = 'force-dynamic';

/**
 * Punto de entrada del área de gestión.
 *
 * Lleva a la primera sección que la persona alcanza de verdad. Redirigir
 * siempre a nombramientos dejaba fuera a quien solo edita contenidos, que
 * aterrizaba en una denegación.
 */
export default async function GestionIndexPage() {
  const actor = await currentActor();
  const sondeo = { ...actor, reason: 'acceso al área de gestión' };

  if (can(sondeo, 'access.role.assign', { kind: 'RoleAssignment' }).allowed) redirect('/gestion/nombramientos');
  if (can(sondeo, 'content.page.read', { kind: 'ContentPage' }).allowed) redirect('/gestion/contenidos');
  if (can(sondeo, 'identity.user.invite', { kind: 'User' }).allowed) redirect('/gestion/personas');
  redirect('/mi/seguridad');
}
