import { db } from '@/platform/db/client';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Quién está a cargo de un expediente (PRD §10.3).
 *
 * El catálogo declara los permisos de caso con `needsAssignment`: además de la
 * facultad hay que estar a cargo de **este** expediente. El motor no puede
 * resolverlo solo —la respuesta está en el dato— y la recibe como sonda del
 * caso de uso.
 *
 * «Estar a cargo» es tener una asignación viva. **No** es pertenecer al área:
 * el PRD §10.3 dice «por asignación y necesidad legítima, nunca por pertenecer
 * al área», y esa distinción es lo único que separa un expediente reservado de
 * una carpeta compartida.
 */
export async function estaAsignada(actor: ActorContext, caseId: string): Promise<boolean> {
  const userId = actor.userId;
  if (userId === null || userId === undefined) return false;

  const asignacion = await db().caseAssignment.findFirst({
    where: { caseId, userId, unassignedAt: null },
    select: { id: true },
  });
  return asignacion !== null;
}

/** Si el expediente es de la persona que pregunta: es parte de él, no lo lleva. */
export async function esParteDelExpediente(actor: ActorContext, caseId: string): Promise<boolean> {
  const personId = actor.personId;
  if (personId === null || personId === undefined) return false;

  const participacion = await db().caseParticipant.findFirst({
    where: { caseId, personId, removedAt: null, canViewCase: true },
    select: { id: true },
  });
  return participacion !== null;
}
