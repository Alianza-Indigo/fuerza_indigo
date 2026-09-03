import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { maskEmail } from '@/platform/audit/audit-service';

/**
 * Personas con cuenta y sus nombramientos vigentes (PRD §24 Fase 1).
 *
 * **Lo que esta consulta no devuelve importa tanto como lo que devuelve.** El
 * Superadmin raíz ve el correo *enmascarado* y ningún dato de contacto,
 * domicilio ni fecha de nacimiento: le basta para administrar cuentas y roles,
 * que es su función, y no le da lectura de datos personales, que le está vedada
 * (docs/PERMISSIONS.md §8).
 */
export interface AdminPersonView {
  readonly userId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly maskedEmail: string;
  readonly status: string;
  readonly lastLoginAt: Date | null;
  readonly isLocked: boolean;
  readonly assignments: readonly {
    readonly id: string;
    readonly role: string;
    readonly legalEntity: string | null;
    readonly territories: readonly string[];
    readonly endsAt: Date | null;
  }[];
}

export async function listAdministrablePeople(
  actor: ActorContext,
  options: { limit?: number } = {},
): Promise<UseCaseResult<AdminPersonView[]>> {
  const decision = can(actor, 'identity.person.read', {
    kind: 'Person',
    // Es una lectura de conjunto sobre datos de personas: la salvaguarda de
    // lectura masiva del actor raíz se evalúa con estos dos atributos.
    isBulk: true,
    containsPersonalData: false,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const now = new Date();
  const rows = await db().user.findMany({
    take: Math.min(options.limit ?? 100, 200),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      status: true,
      lastLoginAt: true,
      lockedUntil: true,
      personId: true,
      person: { select: { givenName: true, familyName: true, secondFamilyName: true } },
      roleAssignments: {
        where: { revokedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        select: {
          id: true,
          endsAt: true,
          role: { select: { code: true } },
          legalEntity: { select: { shortName: true } },
          territorialScopes: { select: { territorialUnit: { select: { name: true } } } },
        },
      },
    },
  });

  return ok(
    rows.map((row) => ({
      userId: row.id,
      personId: row.personId,
      displayName: [row.person.givenName, row.person.familyName, row.person.secondFamilyName]
        .filter((part) => part !== null && part !== '')
        .join(' '),
      maskedEmail: maskEmail(row.email),
      status: row.status,
      lastLoginAt: row.lastLoginAt,
      isLocked: row.lockedUntil !== null && row.lockedUntil > now,
      assignments: row.roleAssignments.map((assignment) => ({
        id: assignment.id,
        role: assignment.role.code,
        legalEntity: assignment.legalEntity?.shortName ?? null,
        territories: assignment.territorialScopes.map((scope) => scope.territorialUnit.name),
        endsAt: assignment.endsAt,
      })),
    })),
  );
}
