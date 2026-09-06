import type { Prisma } from '@prisma-client/client';
import type { CaseDomain } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import type { Resource, TerritorialReach } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { compartimentoDe } from '../domain/access';

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

/**
 * Lo mínimo que hay que saber de un expediente para decidir sobre él.
 *
 * Cuatro datos, y los cuatro se leen de la misma fila: quién responde, de qué
 * lado está, dónde ocurre y cuál es. Se agrupan porque cada caso de uso que
 * decide sobre un expediente necesita exactamente estos y ninguno más.
 */
export interface ExpedienteParaDecidir {
  readonly id: string;
  readonly legalEntityId: string;
  readonly domain: CaseDomain;
  readonly territorialUnit: { readonly path: string } | null;
}

/** Qué seleccionar de un expediente para poder decidir sobre él. */
export const CAMPOS_PARA_DECIDIR = {
  id: true,
  legalEntityId: true,
  domain: true,
  territorialUnit: { select: { path: true } },
} as const satisfies Prisma.CaseSelect;

/**
 * El expediente como recurso, con su territorio.
 *
 * El territorio se pasa **siempre**, y por eso vive en una función y no copiado
 * en cada caso de uso. El PRD §24 exige probar acceso denegado para
 * territorios ajenos; con el recurso armado a mano en cada sitio, bastaba
 * olvidar una línea en uno de ellos para que ese sitio dejara de comprobarlo, y
 * nada lo habría advertido: la comprobación que falta no falla, simplemente
 * permite.
 *
 * Una unidad territorial nula no es «cualquier territorio», es «ninguno»: el
 * motor no comprueba territorio cuando el recurso no lo declara, que es lo
 * correcto para un expediente que no ocurre en ningún sitio concreto.
 */
export function recursoDelExpediente(expediente: ExpedienteParaDecidir): Resource {
  return {
    kind: 'Case',
    id: expediente.id,
    legalEntityId: expediente.legalEntityId,
    territorialPath: expediente.territorialUnit?.path ?? null,
    compartment: compartimentoDe(expediente.domain),
  };
}

/**
 * Filtro de territorio para una consulta que lista expedientes.
 *
 * Devuelve `null` cuando no hay nada que filtrar —alcance total— y un `OR`
 * cuando lo hay. Un expediente sin territorio entra siempre: no está fuera de
 * ninguno, porque no está en ninguno.
 */
export function filtroTerritorial(alcance: TerritorialReach): Prisma.CaseWhereInput | null {
  if (alcance === 'ALL') return null;
  const rutas = alcance.flatMap((ambito) =>
    ambito.includesDescendants
      ? [{ path: ambito.path }, { path: { startsWith: `${ambito.path}/` } }]
      : [{ path: ambito.path }],
  );
  if (rutas.length === 0) return { territorialUnitId: null };
  return { OR: [{ territorialUnitId: null }, { territorialUnit: { OR: rutas } }] };
}
