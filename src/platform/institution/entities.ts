import { db } from '@/platform/db/client';
import { can } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Entidades jurídicas sobre las que el actor puede ejercer un permiso dado.
 *
 * Existe porque la pregunta se repite en cada pantalla que pide elegir entidad,
 * y la respuesta **no es la misma para todas**: depende del permiso que abre esa
 * pantalla. Un listado único gobernado por `institution.legal_entity.read`
 * dejaría fuera a quien administra textos de consentimiento y no tiene por qué
 * leer el registro de entidades jurídicas.
 *
 * No es un caso de uso y por eso no devuelve `UseCaseResult`: quien la llama ya
 * comprobó su propio permiso y esto solo acota la lista que va a ofrecer. Una
 * lista vacía significa que no hay ninguna entidad donde ejercerlo, y la
 * pantalla lo dice; no significa que se le haya denegado nada.
 */
export interface EntityOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export async function entitiesFor(
  actor: ActorContext,
  permissionCode: string,
  resourceKind = 'LegalEntity',
): Promise<EntityOption[]> {
  const entidades = await db().legalEntity.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, shortName: true },
  });

  return entidades
    .filter((entidad) => can(actor, permissionCode, { kind: resourceKind, legalEntityId: entidad.id }).allowed)
    .map((entidad) => ({ id: entidad.id, code: entidad.code, name: entidad.shortName }));
}
