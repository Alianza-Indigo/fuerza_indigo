import { redirect } from 'next/navigation';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { SECCIONES } from './secciones';

export const dynamic = 'force-dynamic';

/**
 * Punto de entrada del área de gestión.
 *
 * Lleva a la primera sección que la persona alcanza de verdad, tomada de la
 * misma lista que dibuja la navegación. Redirigir siempre a nombramientos
 * dejaba fuera a quien solo edita contenidos; llevar una lista aparte dejaba
 * fuera a quien solo lleva el catálogo de cobros. Con una sola lista, añadir una
 * sección basta para que las dos cosas funcionen.
 */
export default async function GestionIndexPage() {
  const actor = await currentActor();
  const sondeo = { ...actor, reason: 'acceso al área de gestión' };

  const primera = SECCIONES.find((seccion) => can(sondeo, seccion.permiso, { kind: 'Gestion' }).allowed);

  // Sin ninguna sección alcanzable no hay área de gestión: se devuelve a la
  // persona a su portal, sin decirle qué existe detrás.
  redirect(primera?.href ?? '/mi/seguridad');
}
