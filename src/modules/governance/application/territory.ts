import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { newPublicId } from '@/platform/kernel/ids';
import { nombreCompleto } from '@/platform/i18n/person-name';
import type { TerritorialStatus, TerritorialUnitType } from '@prisma-client/enums';

/**
 * Estructura territorial (PRD §9.1; F5-TER-001).
 *
 * Tres reglas gobiernan este archivo.
 *
 * **Una unidad territorial nace de un acuerdo, no de un formulario.** El PRD
 * §9.1 exige acuerdo habilitante, y aquí es obligatorio: crear una sección o
 * una delegación pide la resolución aprobada que la constituye. Sin ella el acto
 * no ocurre. Las únicas unidades sin acuerdo son el tronco nacional y las
 * entidades federativas que la semilla instala como marco de referencia, porque
 * no las constituye el sindicato: existen antes que él.
 *
 * **La jerarquía se consulta, no se recorre.** `path` es una ruta materializada
 * (`/mx/jal/guadalajara`, ADR-0027) con índice de prefijo: el subárbol de
 * cualquier unidad se obtiene con una comparación de texto, sin recursión y sin
 * `N` consultas. Por eso la unidad **no se mueve de sitio**: mover una obligaría
 * a reescribir la ruta de toda su descendencia y, sobre todo, mentiría sobre el
 * pasado. Una unidad que deja de pertenecer donde estaba se disuelve, y otra se
 * constituye con su propio acuerdo.
 *
 * **Disolver no es borrar.** La unidad disuelta conserva su fila, su ruta y su
 * historia; lo que cambia es su estado y su fecha de disolución. Y no se
 * disuelve una unidad que todavía sostiene algo: descendencia viva, cargos
 * vigentes o membresías adscritas. Quien quiera disolverla tiene que desmontar
 * primero lo que colgaba de ella, que es exactamente lo que haría en la vida
 * real.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO = /^[A-Z][A-Z0-9_]{2,59}$/;
/** Segmento de ruta: minúsculas, dígitos y guiones. */
const SEGMENTO = /^[a-z0-9][a-z0-9-]{1,58}$/;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Segmento de ruta a partir del código. `SEC_GDL_01` → `sec-gdl-01`. */
export function segmentoDeRuta(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, '-');
}

export const createTerritorialUnitSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CODIGO, { error: () => 'El código lleva mayúsculas, números y guiones bajos. Por ejemplo: SEC_GDL_01.' }),
  name: z.string().trim().min(3).max(160),
  type: z.enum(['FOREIGN_COUNTRY', 'STATE', 'MUNICIPALITY', 'SECTION', 'DELEGATION', 'OFFICE', 'VIRTUAL_THEMATIC'], {
    error: () => 'Elige el tipo de unidad. El tronco nacional no se crea desde aquí.',
  }),
  parentId: z.uuid({ error: () => 'Elige la unidad de la que depende.' }),
  enablingResolutionId: z.uuid({ error: () => 'Elige la resolución que acuerda constituir la unidad.' }),
  createdOn: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
  stateCode: z.string().trim().max(10).nullable().default(null),
  municipalityCode: z.string().trim().max(15).nullable().default(null),
  contactEmail: z.email({ error: () => 'Revisa el correo de contacto.' }).nullable().default(null),
});

export type CreateTerritorialUnitInput = z.infer<typeof createTerritorialUnitSchema>;

export async function createTerritorialUnit(
  actor: ActorContext,
  input: CreateTerritorialUnitInput,
): Promise<UseCaseResult<{ territorialUnitId: string; path: string }>> {
  const parsed = createTerritorialUnitSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'territory.unit.create', { kind: 'TerritorialUnit' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const segmento = segmentoDeRuta(data.code);
  if (!SEGMENTO.test(segmento)) {
    return fail(errors.validation({ code: ['El código no produce una ruta legible. Usa letras, números y guiones bajos.'] }));
  }

  const padre = await db().territorialUnit.findUnique({
    where: { id: data.parentId },
    select: { id: true, path: true, depth: true, name: true, status: true, dissolvedOn: true, countryCode: true },
  });
  if (padre === null) return fail(errors.notFound('La unidad de la que dependería no existe.'));
  if (padre.dissolvedOn !== null || padre.status === 'DISSOLVED') {
    return fail(errors.conflict(`«${padre.name}» está disuelta: no puede sostener una unidad nueva.`));
  }

  const acuerdo = await db().resolution.findUnique({
    where: { id: data.enablingResolutionId },
    select: { id: true, outcome: true, number: true, assembly: { select: { publicId: true } } },
  });
  if (acuerdo === null) return fail(errors.notFound('La resolución habilitante no existe.'));
  if (acuerdo.outcome !== 'APPROVED') {
    return fail(
      errors.conflict('La resolución habilitante no fue aprobada. Una unidad territorial nace de un acuerdo aprobado.'),
    );
  }

  const duplicado = await db().territorialUnit.findUnique({ where: { code: data.code }, select: { id: true } });
  if (duplicado !== null) return fail(errors.conflict('Ya existe una unidad territorial con ese código.'));

  const path = `${padre.path === '/' ? '' : padre.path}/${segmento}`;
  const ocupada = await db().territorialUnit.findUnique({ where: { path }, select: { id: true } });
  if (ocupada !== null) return fail(errors.conflict(`Ya hay una unidad en la ruta ${path}.`));

  const creado = await transaction(async (tx) => {
    const fila = await tx.territorialUnit.create({
      data: {
        publicId: newPublicId(),
        code: data.code,
        name: data.name,
        type: data.type,
        parentId: padre.id,
        path,
        depth: padre.depth + 1,
        countryCode: padre.countryCode,
        stateCode: data.stateCode,
        municipalityCode: data.municipalityCode,
        contactEmail: data.contactEmail,
        status: 'PLANNED',
        createdOn: new Date(`${data.createdOn}T00:00:00.000Z`),
        enablingResolutionId: acuerdo.id,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, path: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.TERRITORIAL_UNIT_CREATED,
      objectKind: 'TerritorialUnit',
      objectId: fila.id,
      outcome: 'SUCCESS',
      territorialUnitId: fila.id,
      metadata: {
        code: data.code,
        type: data.type,
        path: fila.path,
        acuerdo: acuerdo.number ?? `asamblea ${acuerdo.assembly.publicId}`,
      },
    });

    return fila;
  });

  return ok({ territorialUnitId: creado.id, path: creado.path });
}

export const updateTerritorialUnitSchema = z.object({
  territorialUnitId: z.uuid(),
  name: z.string().trim().min(3).max(160),
  contactEmail: z.email({ error: () => 'Revisa el correo de contacto.' }).nullable().default(null),
  status: z.enum(['PLANNED', 'ACTIVE', 'SUSPENDED'], {
    error: () => 'La disolución no se hace desde aquí: tiene su propio acto, con motivo escrito.',
  }),
});

export type UpdateTerritorialUnitInput = z.infer<typeof updateTerritorialUnitSchema>;

export async function updateTerritorialUnit(
  actor: ActorContext,
  input: UpdateTerritorialUnitInput,
): Promise<UseCaseResult<{ updated: true }>> {
  const parsed = updateTerritorialUnitSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'territory.unit.update', { kind: 'TerritorialUnit' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const unidad = await db().territorialUnit.findUnique({
    where: { id: data.territorialUnitId },
    select: { id: true, name: true, status: true, dissolvedOn: true },
  });
  if (unidad === null) return fail(errors.notFound('La unidad territorial no existe.'));
  if (unidad.dissolvedOn !== null || unidad.status === 'DISSOLVED') {
    return fail(errors.conflict('La unidad está disuelta. Su registro es histórico y no se edita.'));
  }

  await transaction(async (tx) => {
    await tx.territorialUnit.update({
      where: { id: unidad.id },
      data: {
        name: data.name,
        contactEmail: data.contactEmail,
        status: data.status,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.TERRITORIAL_UNIT_UPDATED,
      objectKind: 'TerritorialUnit',
      objectId: unidad.id,
      outcome: 'SUCCESS',
      territorialUnitId: unidad.id,
      metadata: { nombreAnterior: unidad.name, nombre: data.name, estado: data.status },
    });
  });

  return ok({ updated: true });
}

export const dissolveTerritorialUnitSchema = z.object({
  territorialUnitId: z.uuid(),
  dissolvedOn: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
  reason: z.string().trim().min(20).max(2000, {
    error: () => 'Escribe el motivo de la disolución: al menos veinte caracteres.',
  }),
});

export type DissolveTerritorialUnitInput = z.infer<typeof dissolveTerritorialUnitSchema>;

/**
 * Disolución de una unidad territorial.
 *
 * Se niega mientras la unidad sostenga algo vivo. La comprobación no es un
 * escrúpulo: la base impide borrar en cascada por diseño (`onDelete: Restrict`),
 * de modo que sin ella la disolución dejaría cargos vigentes y personas adscritas
 * colgando de una unidad que ya no existe institucionalmente.
 */
export async function dissolveTerritorialUnit(
  actor: ActorContext,
  input: DissolveTerritorialUnitInput,
): Promise<UseCaseResult<{ dissolved: true }>> {
  const parsed = dissolveTerritorialUnitSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'territory.unit.dissolve', { kind: 'TerritorialUnit' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const unidad = await db().territorialUnit.findUnique({
    where: { id: data.territorialUnitId },
    select: { id: true, name: true, depth: true, status: true, dissolvedOn: true, createdOn: true },
  });
  if (unidad === null) return fail(errors.notFound('La unidad territorial no existe.'));
  if (unidad.dissolvedOn !== null || unidad.status === 'DISSOLVED') {
    return fail(errors.conflict('La unidad ya estaba disuelta.'));
  }
  if (unidad.depth === 0) {
    return fail(errors.conflict('El tronco nacional no se disuelve desde la plataforma.'));
  }

  const disueltaEl = new Date(`${data.dissolvedOn}T00:00:00.000Z`);
  if (disueltaEl < unidad.createdOn) {
    return fail(errors.validation({ dissolvedOn: ['La disolución no puede ser anterior a la constitución.'] }));
  }

  const ahora = new Date();
  const [descendencia, cargos, membresias, personas] = await Promise.all([
    db().territorialUnit.count({ where: { parentId: unidad.id, dissolvedOn: null } }),
    db().officeTerm.count({ where: { territorialUnitId: unidad.id, endedEarlyOn: null, endsOn: { gte: ahora } } }),
    db().membership.count({ where: { territorialUnitId: unidad.id, status: 'ACTIVE' } }),
    db().person.count({ where: { territorialUnitId: unidad.id } }),
  ]);

  const ataduras: string[] = [];
  if (descendencia > 0) ataduras.push(`${descendencia} unidad(es) que dependen de ella`);
  if (cargos > 0) ataduras.push(`${cargos} cargo(s) vigente(s)`);
  if (membresias > 0) ataduras.push(`${membresias} membresía(s) activa(s)`);
  if (personas > 0) ataduras.push(`${personas} persona(s) adscrita(s)`);
  if (ataduras.length > 0) {
    return fail(
      errors.conflict(
        `«${unidad.name}» todavía sostiene ${ataduras.join(', ')}. Reasigna o cierra lo que cuelga de ella antes de disolverla.`,
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.territorialUnit.update({
      where: { id: unidad.id },
      data: { status: 'DISSOLVED', dissolvedOn: disueltaEl, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.TERRITORIAL_UNIT_DISSOLVED,
      objectKind: 'TerritorialUnit',
      objectId: unidad.id,
      outcome: 'SUCCESS',
      territorialUnitId: unidad.id,
      reason: data.reason,
      metadata: { nombre: unidad.name, disueltaEl: data.dissolvedOn },
    });
  });

  return ok({ dissolved: true });
}

export interface TerritorialNode {
  readonly id: string;
  readonly publicId: string;
  readonly code: string;
  readonly name: string;
  readonly type: TerritorialUnitType;
  readonly status: TerritorialStatus;
  readonly path: string;
  readonly depth: number;
  readonly parentId: string | null;
  readonly dissolvedOn: Date | null;
  readonly contactEmail: string | null;
  readonly hasEnablingResolution: boolean;
}

export interface PublicDelegation {
  readonly publicId: string;
  readonly name: string;
  readonly type: TerritorialUnitType;
  readonly countryCode: string;
  readonly stateCode: string | null;
  readonly contactEmail: string | null;
  readonly parentName: string | null;
}

/**
 * Directorio territorial público.
 *
 * Las entidades federativas que instala la semilla son solo el marco donde
 * puede constituirse una delegación; no prueban que el sindicato ya opere
 * allí. Por eso esta consulta exige acuerdo habilitante además de estado
 * activo. También selecciona únicamente datos institucionales: nunca personas,
 * cargos internos, membresías ni métricas.
 */
export async function publicDelegations(): Promise<readonly PublicDelegation[]> {
  const filas = await db().territorialUnit.findMany({
    where: {
      status: 'ACTIVE',
      dissolvedOn: null,
      enablingResolutionId: { not: null },
      type: { in: ['STATE', 'MUNICIPALITY', 'SECTION', 'DELEGATION'] },
    },
    orderBy: { path: 'asc' },
    select: {
      publicId: true,
      name: true,
      type: true,
      countryCode: true,
      stateCode: true,
      contactEmail: true,
      parent: { select: { name: true } },
    },
  });

  return filas.map((fila) => ({
    publicId: fila.publicId,
    name: fila.name,
    type: fila.type,
    countryCode: fila.countryCode,
    stateCode: fila.stateCode,
    contactEmail: fila.contactEmail,
    parentName: fila.parent?.name ?? null,
  }));
}

/**
 * Jerarquía consultable (F5-TER-001).
 *
 * Devuelve el subárbol completo ordenado por ruta, que es exactamente el orden
 * en que se dibuja un árbol: cada unidad aparece después de su madre y antes de
 * sus hermanas menores. La pantalla no tiene que ordenar nada ni recorrer nada.
 */
export async function territorialTree(
  actor: ActorContext,
  options: { readonly rootId?: string; readonly includeDissolved?: boolean } = {},
): Promise<UseCaseResult<readonly TerritorialNode[]>> {
  const decision = can(actor, 'territory.unit.read', { kind: 'TerritorialUnit' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  let prefijo: string | null = null;
  if (options.rootId !== undefined) {
    const raiz = await db().territorialUnit.findUnique({
      where: { id: options.rootId },
      select: { path: true },
    });
    if (raiz === null) return fail(errors.notFound('La unidad territorial no existe.'));
    prefijo = raiz.path;
  }

  const filas = await db().territorialUnit.findMany({
    where: {
      ...(prefijo === null ? {} : { OR: [{ path: prefijo }, { path: { startsWith: `${prefijo}/` } }] }),
      ...(options.includeDissolved === true ? {} : { dissolvedOn: null }),
    },
    orderBy: { path: 'asc' },
    select: {
      id: true,
      publicId: true,
      code: true,
      name: true,
      type: true,
      status: true,
      path: true,
      depth: true,
      parentId: true,
      dissolvedOn: true,
      contactEmail: true,
      enablingResolutionId: true,
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      publicId: fila.publicId,
      code: fila.code,
      name: fila.name,
      type: fila.type,
      status: fila.status,
      path: fila.path,
      depth: fila.depth,
      parentId: fila.parentId,
      dissolvedOn: fila.dissolvedOn,
      contactEmail: fila.contactEmail,
      hasEnablingResolution: fila.enablingResolutionId !== null,
    })),
  );
}

export interface TerritorialPanelData {
  readonly unit: {
    readonly id: string;
    readonly publicId: string;
    readonly code: string;
    readonly name: string;
    readonly type: TerritorialUnitType;
    readonly status: TerritorialStatus;
    readonly path: string;
    readonly depth: number;
    readonly createdOn: Date;
    readonly dissolvedOn: Date | null;
    readonly contactEmail: string | null;
  };
  /** Ruta institucional, de la raíz a la unidad. Sirve de migas de pan. */
  readonly ancestors: readonly { readonly publicId: string; readonly name: string }[];
  readonly enablingResolution: {
    readonly publicId: string;
    readonly number: string | null;
    readonly assemblyPublicId: string;
  } | null;
  readonly children: readonly { readonly publicId: string; readonly name: string; readonly type: TerritorialUnitType; readonly status: TerritorialStatus }[];
  readonly roster: {
    readonly unionMembers: number;
    readonly honoraryAffiliates: number;
    /** Suspensión de la membresía o proceso disciplinario en curso. */
    readonly suspended: number;
    /** Membresías terminadas por cualquier causa: vencimiento, baja, pérdida, defunción o duplicidad. */
    readonly ended: number;
    readonly beneficiaries: number;
  };
  readonly applications: {
    readonly pending: number;
    readonly clarification: number;
    readonly awaitingPayment: number;
  };
  readonly bodies: readonly { readonly id: string; readonly name: string; readonly code: string }[];
  readonly liveOffices: readonly {
    readonly officeTermId: string;
    readonly officeName: string;
    readonly personName: string;
    readonly endsOn: Date;
  }[];
  readonly assemblies: readonly {
    readonly publicId: string;
    readonly scheduledAt: Date;
    readonly status: string;
    readonly type: string;
  }[];
  readonly indicators: {
    readonly childUnits: number;
    readonly assembliesLastYear: number;
    readonly quorumDeclared: number;
  };
}

/**
 * Panel territorial (PRD §6.3; F5-TER-002).
 *
 * El panel enseña **agregados**, no listas nominales. Quien tiene alcance sobre
 * la unidad ve cuánta gente hay, cuántas solicitudes esperan y quién ocupa cada
 * cargo; para ver el padrón nominal o el expediente de una solicitud hay que
 * entrar a la pantalla que le corresponde, que vuelve a evaluar su propio
 * permiso. Un tablero que reúne todo lo que alguien *podría* ver acaba
 * enseñándole lo que no.
 *
 * Los casos de defensa y las comunicaciones que el PRD §6.3 también lista se
 * construyen en las Fases 6 y 7, con sus propios modelos: no se anticipan aquí
 * con una tarjeta vacía.
 */
export async function territorialPanel(
  actor: ActorContext,
  publicId: string,
): Promise<UseCaseResult<TerritorialPanelData>> {
  const decision = can(actor, 'territory.unit.read', { kind: 'TerritorialUnit' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const unidad = await db().territorialUnit.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      code: true,
      name: true,
      type: true,
      status: true,
      path: true,
      depth: true,
      createdOn: true,
      dissolvedOn: true,
      contactEmail: true,
      enablingResolution: {
        select: { publicId: true, number: true, assembly: { select: { publicId: true } } },
      },
    },
  });
  if (unidad === null) return fail(errors.notFound('La unidad territorial no existe.'));

  // Rutas de las ascendientes: `/mx/jal/gdl` produce `/mx` y `/mx/jal`.
  const segmentos = unidad.path.split('/').filter((parte) => parte !== '');
  const rutasAscendientes: string[] = [];
  let acumulada = '';
  for (const segmento of segmentos.slice(0, -1)) {
    acumulada = `${acumulada}/${segmento}`;
    rutasAscendientes.push(acumulada);
  }

  const haceUnAno = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [
    ascendientes,
    hijas,
    agremiados,
    honorarios,
    suspendidas,
    terminadas,
    beneficiarios,
    pendientes,
    aclaracion,
    esperandoPago,
    organos,
    cargos,
    asambleas,
    asambleasDelAno,
    quorumDeclarado,
  ] = await Promise.all([
    rutasAscendientes.length === 0
      ? Promise.resolve([])
      : db().territorialUnit.findMany({
          where: { path: { in: rutasAscendientes } },
          orderBy: { depth: 'asc' },
          select: { publicId: true, name: true },
        }),
    db().territorialUnit.findMany({
      where: { parentId: unidad.id, dissolvedOn: null },
      orderBy: { name: 'asc' },
      select: { publicId: true, name: true, type: true, status: true },
    }),
    db().membership.count({ where: { territorialUnitId: unidad.id, status: 'ACTIVE', category: 'UNION_MEMBER' } }),
    db().membership.count({
      where: { territorialUnitId: unidad.id, status: 'ACTIVE', category: 'HONORARY_AFFILIATE' },
    }),
    db().membership.count({
      where: { territorialUnitId: unidad.id, status: { in: ['SUSPENDED', 'DISCIPLINARY_PROCESS'] } },
    }),
    db().membership.count({
      where: {
        territorialUnitId: unidad.id,
        status: { in: ['EXPIRED', 'VOLUNTARY_WITHDRAWAL', 'STATUS_LOSS', 'DECEASED', 'CANCELLED_DUPLICATE'] },
      },
    }),
    db().protectedBeneficiary.count({ where: { territorialUnitId: unidad.id } }),
    db().membershipApplication.count({
      where: {
        territorialUnitId: unidad.id,
        status: { in: ['SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW'] },
      },
    }),
    db().membershipApplication.count({
      where: { territorialUnitId: unidad.id, status: 'CLARIFICATION_REQUIRED' },
    }),
    db().membershipApplication.count({ where: { territorialUnitId: unidad.id, status: 'PENDING_PAYMENT' } }),
    db().unionBody.findMany({
      where: { territorialUnitId: unidad.id, status: { not: 'DISSOLVED' } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    }),
    db().officeTerm.findMany({
      where: { territorialUnitId: unidad.id, endedEarlyOn: null, endsOn: { gte: new Date() } },
      orderBy: { endsOn: 'asc' },
      select: {
        id: true,
        endsOn: true,
        officeDefinition: { select: { name: true } },
        person: {
          select: {
            givenName: true,
            middleName: true,
            familyName: true,
            secondFamilyName: true,
            preferredName: true,
          },
        },
      },
    }),
    db().assembly.findMany({
      where: { territorialUnitId: unidad.id },
      orderBy: { scheduledAt: 'desc' },
      take: 20,
      select: { publicId: true, scheduledAt: true, status: true, type: true },
    }),
    db().assembly.count({ where: { territorialUnitId: unidad.id, scheduledAt: { gte: haceUnAno } } }),
    db().assembly.count({ where: { territorialUnitId: unidad.id, quorumDeclaredAt: { not: null } } }),
  ]);

  return ok({
    unit: {
      id: unidad.id,
      publicId: unidad.publicId,
      code: unidad.code,
      name: unidad.name,
      type: unidad.type,
      status: unidad.status,
      path: unidad.path,
      depth: unidad.depth,
      createdOn: unidad.createdOn,
      dissolvedOn: unidad.dissolvedOn,
      contactEmail: unidad.contactEmail,
    },
    ancestors: ascendientes,
    enablingResolution:
      unidad.enablingResolution === null
        ? null
        : {
            publicId: unidad.enablingResolution.publicId,
            number: unidad.enablingResolution.number,
            assemblyPublicId: unidad.enablingResolution.assembly.publicId,
          },
    children: hijas,
    roster: {
      unionMembers: agremiados,
      honoraryAffiliates: honorarios,
      suspended: suspendidas,
      ended: terminadas,
      beneficiaries: beneficiarios,
    },
    applications: { pending: pendientes, clarification: aclaracion, awaitingPayment: esperandoPago },
    bodies: organos,
    liveOffices: cargos.map((cargo) => ({
      officeTermId: cargo.id,
      officeName: cargo.officeDefinition.name,
      personName: nombreCompleto(cargo.person),
      endsOn: cargo.endsOn,
    })),
    assemblies: asambleas.map((asamblea) => ({
      publicId: asamblea.publicId,
      scheduledAt: asamblea.scheduledAt,
      status: asamblea.status,
      type: asamblea.type,
    })),
    indicators: {
      childUnits: hijas.length,
      assembliesLastYear: asambleasDelAno,
      quorumDeclared: quorumDeclarado,
    },
  });
}

export interface ApprovedResolutionOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Resoluciones aprobadas, para los formularios que exigen un acuerdo.
 *
 * La usan la constitución de una unidad territorial y la puesta en vigor de una
 * reforma estatutaria: los dos actos que no ocurren sin acuerdo de asamblea.
 * Existe para que el formulario no ofrezca lo que el caso de uso va a rechazar
 * (PRD §0.3): solo entran las aprobadas. Devuelve el número, la fecha y el
 * órgano —lo justo para reconocer el acuerdo—, no su texto.
 */
export async function approvedResolutionOptions(
  actor: ActorContext,
): Promise<UseCaseResult<readonly ApprovedResolutionOption[]>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'Resolution' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().resolution.findMany({
    where: { outcome: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      number: true,
      publicId: true,
      assembly: {
        select: { scheduledAt: true, unionBody: { select: { name: true } } },
      },
    },
  });

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' });
  return ok(
    filas.map((fila) => ({
      id: fila.id,
      label: `${fila.number ?? fila.publicId} · ${fila.assembly.unionBody.name} · ${fecha.format(fila.assembly.scheduledAt)}`,
    })),
  );
}
