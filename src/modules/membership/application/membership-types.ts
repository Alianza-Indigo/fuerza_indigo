import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { startOfDayInZone } from '@/platform/i18n/format';
import { entitiesFor } from '@/platform/institution/entities';

/**
 * Catálogo de calidades de membresía (PRD §3.2, §3.3).
 *
 * Aquí se administra **qué existe** y **qué concede**: si vota, si computa para
 * el quórum, si aparece en el padrón que se remite a la autoridad laboral, si
 * exige revisión humana, si exige pago y cuánto dura.
 *
 * Dos cosas que este módulo no decide y por eso no pregunta:
 *
 *  · **El importe.** Lo fija el catálogo financiero. Aquí se elige el concepto
 *    con el que se cobra, no la cantidad (ADR-0040).
 *  · **Los derechos de la calidad honoraria.** El motor rechaza un tipo
 *    honorario que conceda derechos políticos, y no por precaución: el PRD §24
 *    Fase 4 exige que un afiliado honorario no obtenga voto **por error**, y un
 *    error es justo lo que una pantalla no puede impedir.
 */

const CODIGO = /^[A-Z][A-Z0-9_]{2,59}$/;

const base = {
  name: z.string().trim().min(3).max(160),
  benefitsSummary: z
    .string()
    .trim()
    .min(20, { error: () => 'Explica qué da esta calidad: es lo que leerá quien se afilie.' })
    .max(2000),
  requiresHumanReview: z.boolean().default(true),
  requiresPayment: z.boolean().default(false),
  catalogProductId: z.uuid().nullable().default(null),
  durationMonths: z.coerce
    .number()
    .int({ error: () => 'La vigencia va en meses enteros.' })
    .positive({ error: () => 'Una vigencia de cero meses no es una vigencia.' })
    .max(1200)
    .nullable()
    .default(null),
  renewable: z.boolean().default(true),
  effectiveFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2026-01-01.' }),
  effectiveTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2026-12-31.' })
    .nullable()
    .default(null),
  isActive: z.boolean().default(true),
} as const;

export const createMembershipTypeSchema = z
  .object({
    ...base,
    code: z.string().trim().toUpperCase().regex(CODIGO, {
      error: () => 'El código lleva mayúsculas, números y guiones bajos. Por ejemplo: AGREMIADO_JUBILADO.',
    }),
    category: z.enum(['UNION_MEMBER', 'HONORARY_AFFILIATE']),
    legalEntityId: z.uuid({ error: () => 'Elige la entidad jurídica a la que pertenece esta calidad.' }),
    grantsPoliticalRights: z.boolean().default(false),
    countsForQuorum: z.boolean().default(false),
    appearsInAuthorityRoster: z.boolean().default(false),
  })
  .superRefine((valor, ctx) => {
    if (valor.category !== 'HONORARY_AFFILIATE') return;
    for (const campo of ['grantsPoliticalRights', 'countsForQuorum', 'appearsInAuthorityRoster'] as const) {
      if (valor[campo]) {
        ctx.addIssue({
          code: 'custom',
          path: [campo],
          message:
            'Una calidad honoraria no concede derechos políticos sindicales, no computa para el quórum y no aparece ante la autoridad laboral (PRD §3.3).',
        });
      }
    }
  });

export type CreateMembershipTypeInput = z.input<typeof createMembershipTypeSchema>;

/**
 * La categoría y los derechos **no** se editan.
 *
 * Convertir una calidad honoraria en sindical con un formulario daría el voto a
 * quien no lo tiene, retroactivamente y sobre todas las membresías vivas de ese
 * tipo. Una calidad nueva es una calidad nueva.
 */
export const updateMembershipTypeSchema = z.object({
  ...base,
  membershipTypeId: z.uuid(),
});

export type UpdateMembershipTypeInput = z.input<typeof updateMembershipTypeSchema>;

/**
 * Fecha de calendario a instante, en la zona de quien captura (ADR-0051).
 *
 * `startOfDayInZone` devuelve `null` ante un texto que no sea una fecha, y el
 * esquema ya lo impide: la comprobación de aquí no es desconfianza sino la única
 * forma de que el compilador vea que a la columna llega una fecha y no un nulo.
 */
function fechaDeCalendario(valor: string, zona: string): Date | null {
  return startOfDayInZone(valor, zona);
}

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

async function conceptoValido(
  catalogProductId: string | null,
  legalEntityId: string,
): Promise<{ ok: true } | { ok: false; error: ReturnType<typeof errors.validation> }> {
  if (catalogProductId === null) return { ok: true };
  const producto = await db().catalogProduct.findUnique({
    where: { id: catalogProductId },
    select: { legalEntityId: true, isActive: true },
  });
  if (producto === null) {
    return { ok: false, error: errors.validation({ catalogProductId: ['Ese concepto no existe.'] }) };
  }
  if (producto.legalEntityId !== legalEntityId) {
    return {
      ok: false,
      error: errors.validation({
        catalogProductId: [
          'Ese concepto lo cobra otra entidad jurídica. Una calidad no puede cobrarse por una entidad distinta de la suya.',
        ],
      }),
    };
  }
  if (!producto.isActive) {
    return { ok: false, error: errors.validation({ catalogProductId: ['Ese concepto está archivado.'] }) };
  }
  return { ok: true };
}

export async function createMembershipType(
  actor: ActorContext,
  input: CreateMembershipTypeInput,
): Promise<UseCaseResult<{ membershipTypeId: string; code: string }>> {
  const parsed = createMembershipTypeSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'membership.type.manage', {
    kind: 'MembershipType',
    legalEntityId: parsed.data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const datos = parsed.data;

  if (datos.requiresPayment && datos.catalogProductId === null) {
    return fail(
      errors.validation({
        catalogProductId: ['Si la calidad exige pago, elige con qué concepto del catálogo se cobra.'],
      }),
    );
  }

  const concepto = await conceptoValido(datos.catalogProductId, datos.legalEntityId);
  if (!concepto.ok) return fail(concepto.error);

  const desde = fechaDeCalendario(datos.effectiveFrom, actor.timeZone);
  const hasta = datos.effectiveTo === null ? null : fechaDeCalendario(datos.effectiveTo, actor.timeZone);
  if (desde === null || (datos.effectiveTo !== null && hasta === null)) {
    return fail(errors.validation({ effectiveFrom: ['Revisa las fechas: van como 2026-01-01.'] }));
  }
  if (hasta !== null && hasta <= desde) {
    return fail(errors.validation({ effectiveTo: ['La vigencia no puede terminar antes de empezar.'] }));
  }

  const existente = await db().membershipType.findUnique({ where: { code: datos.code }, select: { id: true } });
  if (existente !== null) {
    return fail(errors.conflict('Ya existe una calidad con ese código.', 'código repetido'));
  }

  const creada = await transaction(async (tx) => {
    const tipo = await tx.membershipType.create({
      data: {
        code: datos.code,
        name: datos.name,
        category: datos.category,
        legalEntityId: datos.legalEntityId,
        grantsPoliticalRights: datos.grantsPoliticalRights,
        countsForQuorum: datos.countsForQuorum,
        appearsInAuthorityRoster: datos.appearsInAuthorityRoster,
        requiresHumanReview: datos.requiresHumanReview,
        requiresPayment: datos.requiresPayment,
        catalogProductId: datos.catalogProductId,
        durationMonths: datos.durationMonths,
        renewable: datos.renewable,
        benefitsSummary: datos.benefitsSummary,
        effectiveFrom: desde,
        effectiveTo: hasta,
        isActive: datos.isActive,
      },
      select: { id: true, code: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MEMBERSHIP_TYPE_CREATED,
      objectKind: 'MembershipType',
      objectId: tipo.id,
      outcome: 'SUCCESS',
      legalEntityId: datos.legalEntityId,
      metadata: {
        code: tipo.code,
        category: datos.category,
        derechosPoliticos: datos.grantsPoliticalRights,
        padronDeAutoridad: datos.appearsInAuthorityRoster,
      },
    });

    return tipo;
  });

  return ok({ membershipTypeId: creada.id, code: creada.code });
}

export async function updateMembershipType(
  actor: ActorContext,
  input: UpdateMembershipTypeInput,
): Promise<UseCaseResult<{ membershipTypeId: string }>> {
  const parsed = updateMembershipTypeSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const datos = parsed.data;

  const actual = await db().membershipType.findUnique({
    where: { id: datos.membershipTypeId },
    select: { id: true, legalEntityId: true, category: true },
  });
  if (actual === null) return fail(errors.notFound('calidad inexistente'));

  const decision = can(actor, 'membership.type.manage', {
    kind: 'MembershipType',
    id: actual.id,
    legalEntityId: actual.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (datos.requiresPayment && datos.catalogProductId === null) {
    return fail(
      errors.validation({
        catalogProductId: ['Si la calidad exige pago, elige con qué concepto del catálogo se cobra.'],
      }),
    );
  }

  const concepto = await conceptoValido(datos.catalogProductId, actual.legalEntityId);
  if (!concepto.ok) return fail(concepto.error);

  const desde = fechaDeCalendario(datos.effectiveFrom, actor.timeZone);
  const hasta = datos.effectiveTo === null ? null : fechaDeCalendario(datos.effectiveTo, actor.timeZone);
  if (desde === null || (datos.effectiveTo !== null && hasta === null)) {
    return fail(errors.validation({ effectiveFrom: ['Revisa las fechas: van como 2026-01-01.'] }));
  }
  if (hasta !== null && hasta <= desde) {
    return fail(errors.validation({ effectiveTo: ['La vigencia no puede terminar antes de empezar.'] }));
  }

  await transaction(async (tx) => {
    await tx.membershipType.update({
      where: { id: datos.membershipTypeId },
      data: {
        name: datos.name,
        requiresHumanReview: datos.requiresHumanReview,
        requiresPayment: datos.requiresPayment,
        catalogProductId: datos.catalogProductId,
        durationMonths: datos.durationMonths,
        renewable: datos.renewable,
        benefitsSummary: datos.benefitsSummary,
        effectiveFrom: desde,
        effectiveTo: hasta,
        isActive: datos.isActive,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MEMBERSHIP_TYPE_UPDATED,
      objectKind: 'MembershipType',
      objectId: datos.membershipTypeId,
      outcome: 'SUCCESS',
      legalEntityId: actual.legalEntityId,
    });
  });

  return ok({ membershipTypeId: datos.membershipTypeId });
}

export interface MembershipTypeRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: 'UNION_MEMBER' | 'HONORARY_AFFILIATE';
  readonly legalEntity: string;
  readonly legalEntityId: string;
  readonly grantsPoliticalRights: boolean;
  readonly countsForQuorum: boolean;
  readonly appearsInAuthorityRoster: boolean;
  readonly requiresHumanReview: boolean;
  readonly requiresPayment: boolean;
  readonly catalogProductId: string | null;
  readonly catalogProduct: string | null;
  readonly durationMonths: number | null;
  readonly renewable: boolean;
  readonly benefitsSummary: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly isActive: boolean;
  readonly liveMemberships: number;
}

export async function membershipTypeList(
  actor: ActorContext,
  options: { onlyActive?: boolean } = {},
): Promise<UseCaseResult<MembershipTypeRow[]>> {
  const decision = can(actor, 'membership.type.read', { kind: 'MembershipType' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().membershipType.findMany({
    ...(options.onlyActive === true ? { where: { isActive: true } } : {}),
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      legalEntityId: true,
      grantsPoliticalRights: true,
      countsForQuorum: true,
      appearsInAuthorityRoster: true,
      requiresHumanReview: true,
      requiresPayment: true,
      catalogProductId: true,
      durationMonths: true,
      renewable: true,
      benefitsSummary: true,
      effectiveFrom: true,
      effectiveTo: true,
      isActive: true,
      legalEntity: { select: { shortName: true } },
      catalogProduct: { select: { name: true } },
      _count: { select: { memberships: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      code: fila.code,
      name: fila.name,
      category: fila.category,
      legalEntity: fila.legalEntity.shortName,
      legalEntityId: fila.legalEntityId,
      grantsPoliticalRights: fila.grantsPoliticalRights,
      countsForQuorum: fila.countsForQuorum,
      appearsInAuthorityRoster: fila.appearsInAuthorityRoster,
      requiresHumanReview: fila.requiresHumanReview,
      requiresPayment: fila.requiresPayment,
      catalogProductId: fila.catalogProductId,
      catalogProduct: fila.catalogProduct?.name ?? null,
      durationMonths: fila.durationMonths,
      renewable: fila.renewable,
      benefitsSummary: fila.benefitsSummary,
      effectiveFrom: fila.effectiveFrom,
      effectiveTo: fila.effectiveTo,
      isActive: fila.isActive,
      liveMemberships: fila._count.memberships,
    })),
  );
}

export interface MembershipTypeFormOptions {
  readonly legalEntities: readonly { readonly id: string; readonly code: string; readonly name: string }[];
  readonly catalogProducts: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly legalEntityId: string;
  }[];
}

/**
 * Opciones para el formulario de calidades: entidades y conceptos cobrables.
 *
 * Va aquí y no en el módulo de finanzas porque las consultas de allá exigen
 * `billing.catalog.manage`, que la cartera de Organización no tiene ni debe
 * tener: administra calidades, no precios. Lo que necesita es **elegir** el
 * concepto con el que se cobra una calidad, y para eso basta con verlo.
 *
 * Se devuelven solo los conceptos ligados a una membresía o a una afiliación
 * honoraria: ofrecer aquí un curso o una donación invitaría a cobrar una cuota
 * sindical con el concepto equivocado, y ese error se descubre al conciliar.
 */
export async function membershipTypeFormOptions(
  actor: ActorContext,
): Promise<UseCaseResult<MembershipTypeFormOptions>> {
  const decision = can(actor, 'membership.type.manage', { kind: 'MembershipType' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const [entidades, productos] = await Promise.all([
    entitiesFor(actor, 'membership.type.manage', 'MembershipType'),
    db().catalogProduct.findMany({
      where: { isActive: true, moduleBinding: { in: ['MEMBERSHIP', 'HONORARY_AFFILIATION'] } },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, legalEntityId: true },
    }),
  ]);

  return ok({ legalEntities: entidades, catalogProducts: productos });
}
