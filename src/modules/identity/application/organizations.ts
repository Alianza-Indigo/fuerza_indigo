import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import type { OrganizationKind, OrganizationStatus } from '@prisma-client/enums';

/**
 * Registro de organizaciones (PRD §3.5).
 *
 * `Organization` vive en el modelo de identidad porque una organización es,
 * como una persona, un sujeto con el que la institución se relaciona: un centro
 * de trabajo, una contraparte patronal, una asociación aliada. Quien la
 * necesita —la negociación colectiva, por ejemplo— la lee por aquí y no con una
 * consulta propia: la regla de frontera prohíbe las consultas cruzadas
 * (docs/ARCHITECTURE.md §4.2).
 */

export interface OrganizationRow {
  readonly id: string;
  readonly publicId: string;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly kind: OrganizationKind;
  readonly status: OrganizationStatus;
  readonly territory: string | null;
}

/** Organizaciones vivas, para elegir una contraparte o un centro de trabajo. */
export async function organizationList(
  actor: ActorContext,
  filters: { readonly kinds?: readonly OrganizationKind[] } = {},
): Promise<UseCaseResult<readonly OrganizationRow[]>> {
  const decision = can(actor, 'identity.person.read', { kind: 'Organization' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().organization.findMany({
    where: {
      archivedAt: null,
      ...(filters.kinds === undefined ? {} : { kind: { in: [...filters.kinds] } }),
    },
    orderBy: { legalName: 'asc' },
    take: 500,
    select: {
      id: true,
      publicId: true,
      legalName: true,
      tradeName: true,
      kind: true,
      status: true,
      territorialUnit: { select: { name: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      publicId: fila.publicId,
      legalName: fila.legalName,
      tradeName: fila.tradeName,
      kind: fila.kind,
      status: fila.status,
      territory: fila.territorialUnit?.name ?? null,
    })),
  );
}
