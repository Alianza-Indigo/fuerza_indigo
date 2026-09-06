import { db } from '@/platform/db/client';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Órganos en los que la persona actuante ocupa hoy un cargo vivo.
 *
 * El catálogo declara los permisos disciplinarios con `needsAssignment`: no
 * basta con tener la facultad, hay que estar a cargo del expediente. Quien la
 * comprueba es el caso de uso, aportando esta sonda; sin ella el motor niega
 * siempre, que fue exactamente lo que ocurrió —el módulo entero era
 * inalcanzable, con pantalla, formularios y todo, y ninguna prueba lo notaba
 * porque ninguna llamaba a la lista con una sesión real—. Lo encontró la
 * revisión de accesibilidad de las pantallas institucionales, al exigir que una
 * ruta que la navegación ofrece no responda «no tienes autorización».
 *
 * «Estar a cargo» es tener un periodo de cargo vigente en el órgano que
 * instruye. No es el rol: el rol dice qué sabe hacer una persona, el cargo dice
 * de qué responde. Instruir un procedimiento disciplinario sin cargo en el
 * órgano instructor es precisamente lo que el debido proceso no admite.
 */
export async function bodiesWithLiveOffice(actor: ActorContext): Promise<readonly string[]> {
  const personId = actor.personId;
  if (personId === null || personId === undefined) return [];

  const hoy = new Date();
  const periodos = await db().officeTerm.findMany({
    where: {
      personId,
      endedEarlyOn: null,
      startsOn: { lte: hoy },
      endsOn: { gte: hoy },
    },
    select: { officeDefinition: { select: { unionBodyId: true } } },
  });

  return [...new Set(periodos.map((periodo) => periodo.officeDefinition.unionBodyId))];
}

/** Sonda para `can`: ¿instruye esta persona en ese órgano? */
export function instruyeEn(organos: readonly string[], unionBodyId: string): () => boolean {
  return () => organos.includes(unionBodyId);
}
