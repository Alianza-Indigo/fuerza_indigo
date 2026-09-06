import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { huellaDePadron, type RosterEntryShape } from '../domain/roster-hash';

export { huellaDePadron, type RosterEntryShape } from '../domain/roster-hash';
import { nombreCompleto } from '@/platform/i18n/person-name';

/**
 * Padrón congelado de una sesión (PRD §9.4; F5-ASA-003).
 *
 * **Congelar es el acto que hace verificable todo lo demás.** El quórum se
 * calcula sobre el padrón congelado, no sobre el padrón de hoy; el voto se
 * emite contra él; y el acta se sostiene en él. Si el padrón pudiera
 * recalcularse después de la sesión, cualquier alta o baja posterior cambiaría
 * retroactivamente si hubo quórum.
 *
 * Tres cosas lo hacen comprobable:
 *
 *  1. **Es inmutable en la base.** El motor retira el privilegio de
 *     actualización y borrado sobre las dos tablas: ni la aplicación ni una
 *     conexión con las credenciales de la aplicación pueden reescribirlo.
 *  2. **Tiene huella.** `hash` es el `sha256` de la forma canónica de las
 *     entradas, ordenadas por número de miembro. Quien reciba el padrón puede
 *     recalcularla con la función de abajo y comparar; no hace falta confiar.
 *  3. **Guarda sus criterios.** `criteria` conserva las reglas de elegibilidad
 *     tal como se evaluaron, de modo que se puede decir por qué alguien entró y
 *     por qué alguien no.
 *
 * **Quién entra.** Solo agremiados con la membresía activa. Los afiliados
 * honorarios y las personas beneficiarias **no votan** (PRD §24 Fase 5), y aquí
 * ni siquiera aparecen: no se listan sin voto, no se listan. Quien tiene los
 * derechos políticos suspendidos sí aparece —sigue siendo agremiado y cuenta
 * para el quórum— pero con `hasVote` en falso.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export interface RosterCriteria {
  /** Unidad territorial de la asamblea; el padrón alcanza a ella y a su descendencia. */
  readonly territorialPath: string;
  readonly includesDescendants: boolean;
  readonly membershipStatus: readonly string[];
  readonly category: string;
  readonly requiresPoliticalRights: boolean;
  readonly frozenAtIso: string;
  readonly normativeVersion: string;
}

/**
 * Reúne las membresías elegibles de una asamblea.
 *
 * Se usa al congelar y también para previsualizar antes de congelar: enseñar a
 * quién va a alcanzar el padrón **antes** del acto irreversible evita congelar
 * un padrón equivocado, que no se puede deshacer.
 */
async function membresiasElegibles(
  cliente: Tx | ReturnType<typeof db>,
  rutaTerritorial: string,
  ahora: Date,
): Promise<readonly RosterEntryShape[]> {
  const filas = await cliente.membership.findMany({
    where: {
      status: 'ACTIVE',
      category: 'UNION_MEMBER',
      membershipType: { countsForQuorum: true },
      territorialUnit: {
        OR: [{ path: rutaTerritorial }, { path: { startsWith: `${rutaTerritorial}/` } }],
      },
    },
    orderBy: { memberNumber: 'asc' },
    select: {
      id: true,
      memberNumber: true,
      territorialUnitId: true,
      politicalRightsSuspendedUntil: true,
      membershipType: { select: { grantsPoliticalRights: true } },
    },
  });

  return filas.map((fila) => {
    const suspendida =
      fila.politicalRightsSuspendedUntil !== null && fila.politicalRightsSuspendedUntil > ahora;
    return {
      membershipId: fila.id,
      memberNumber: fila.memberNumber,
      territorialUnitId: fila.territorialUnitId,
      // Voz siempre: estar suspendido de derechos políticos no calla a nadie.
      hasVoice: true,
      hasVote: fila.membershipType.grantsPoliticalRights && !suspendida,
    };
  });
}

export interface RosterPreview {
  readonly total: number;
  readonly withVote: number;
  readonly withoutVote: number;
  readonly territory: string;
  readonly alreadyFrozen: boolean;
}

/** Vista previa del padrón, antes del acto irreversible de congelarlo. */
export async function rosterPreview(
  actor: ActorContext,
  assemblyId: string,
): Promise<UseCaseResult<RosterPreview>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'AssemblyRosterSnapshot' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const asamblea = await db().assembly.findUnique({
    where: { id: assemblyId },
    select: {
      id: true,
      territorialUnit: { select: { name: true, path: true } },
      rosterSnapshot: { select: { id: true } },
    },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));

  const entradas = await membresiasElegibles(db(), asamblea.territorialUnit.path, new Date());

  return ok({
    total: entradas.length,
    withVote: entradas.filter((entrada) => entrada.hasVote).length,
    withoutVote: entradas.filter((entrada) => !entrada.hasVote).length,
    territory: asamblea.territorialUnit.name,
    alreadyFrozen: asamblea.rosterSnapshot !== null,
  });
}

export const freezeRosterSchema = z.object({ assemblyId: z.uuid() });

export interface FrozenRoster {
  readonly rosterId: string;
  readonly entryCount: number;
  readonly withVote: number;
  readonly hash: string;
}

/**
 * Congela el padrón de la sesión.
 *
 * Ocurre una sola vez y no se deshace. La transacción escribe la instantánea,
 * sus entradas y el asiento de auditoría a la vez: un padrón sin asiento sería
 * un padrón sin autor.
 */
export async function freezeRoster(
  actor: ActorContext,
  input: z.infer<typeof freezeRosterSchema>,
): Promise<UseCaseResult<FrozenRoster>> {
  const parsed = freezeRosterSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.roster.freeze', { kind: 'AssemblyRosterSnapshot' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienCongela = actor.userId;
  if (quienCongela === null || quienCongela === undefined) {
    return fail(errors.forbidden('Congelar el padrón es un acto de una persona: exige una cuenta.'));
  }

  const asamblea = await db().assembly.findUnique({
    where: { id: parsed.data.assemblyId },
    select: {
      id: true,
      publicId: true,
      status: true,
      territorialUnitId: true,
      territorialUnit: { select: { path: true } },
      normativeRuleSet: { select: { version: true } },
      rosterSnapshot: { select: { id: true } },
      calls: { select: { id: true } },
    },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));
  if (asamblea.rosterSnapshot !== null) {
    return fail(
      errors.conflict('El padrón de esta asamblea ya está congelado. No se congela dos veces ni se descongela.'),
    );
  }
  if (asamblea.calls.length === 0) {
    return fail(
      errors.conflict('Primero se convoca. El padrón se congela sobre una asamblea convocada, no sobre una idea.'),
    );
  }
  if (asamblea.status === 'CANCELLED') return fail(errors.conflict('Esa asamblea está cancelada.'));

  const congeladoEl = new Date();
  const entradas = await membresiasElegibles(db(), asamblea.territorialUnit.path, congeladoEl);
  if (entradas.length === 0) {
    return fail(
      errors.conflict(
        'No hay ninguna membresía elegible en el alcance territorial de la asamblea. Un padrón vacío no permite calcular quórum.',
      ),
    );
  }

  const hash = huellaDePadron(entradas);
  const criteria: RosterCriteria = {
    territorialPath: asamblea.territorialUnit.path,
    includesDescendants: true,
    membershipStatus: ['ACTIVE'],
    category: 'UNION_MEMBER',
    requiresPoliticalRights: false,
    frozenAtIso: congeladoEl.toISOString(),
    normativeVersion: asamblea.normativeRuleSet.version,
  };

  const congelado = await transaction(async (tx) => {
    const snapshot = await tx.assemblyRosterSnapshot.create({
      data: {
        ownerKind: 'ASSEMBLY',
        assemblyId: asamblea.id,
        frozenAt: congeladoEl,
        frozenById: quienCongela,
        criteria: { ...criteria, membershipStatus: [...criteria.membershipStatus] },
        entryCount: entradas.length,
        hash,
      },
      select: { id: true },
    });

    await tx.assemblyRosterEntry.createMany({
      data: entradas.map((entrada) => ({
        rosterId: snapshot.id,
        membershipId: entrada.membershipId,
        memberNumber: entrada.memberNumber,
        territorialUnitId: entrada.territorialUnitId,
        hasVoice: entrada.hasVoice,
        hasVote: entrada.hasVote,
      })),
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ROSTER_FROZEN,
      objectKind: 'AssemblyRosterSnapshot',
      objectId: snapshot.id,
      outcome: 'SUCCESS',
      territorialUnitId: asamblea.territorialUnitId,
      metadata: {
        asamblea: asamblea.publicId,
        entradas: entradas.length,
        conVoto: entradas.filter((entrada) => entrada.hasVote).length,
        hash,
      },
    });

    return snapshot;
  });

  return ok({
    rosterId: congelado.id,
    entryCount: entradas.length,
    withVote: entradas.filter((entrada) => entrada.hasVote).length,
    hash,
  });
}

export interface RosterView {
  readonly rosterId: string;
  readonly frozenAt: Date;
  readonly entryCount: number;
  readonly withVote: number;
  readonly hash: string;
  /** Huella recalculada ahora sobre las entradas guardadas. */
  readonly recomputedHash: string;
  /** Si la huella guardada corresponde con las entradas que hoy tiene la instantánea. */
  readonly intact: boolean;
  readonly criteria: unknown;
}

/**
 * Padrón congelado con su comprobación de integridad.
 *
 * Recalcula la huella cada vez que se consulta y la compara con la guardada. No
 * es paranoia: es lo que convierte «el padrón es inmutable» en algo que se ve
 * en pantalla en vez de algo que se promete en la documentación.
 */
export async function frozenRoster(
  actor: ActorContext,
  assemblyId: string,
): Promise<UseCaseResult<RosterView | null>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'AssemblyRosterSnapshot' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  return await leerPadron(db().assemblyRosterSnapshot.findUnique({
    where: { assemblyId },
    select: {
      id: true,
      frozenAt: true,
      entryCount: true,
      hash: true,
      criteria: true,
      entries: {
        select: {
          membershipId: true,
          memberNumber: true,
          territorialUnitId: true,
          hasVoice: true,
          hasVote: true,
        },
      },
    },
  }));
}

/** Padrón congelado de una elección, con la misma comprobación de integridad. */
export async function electionRoster(
  actor: ActorContext,
  electionId: string,
): Promise<UseCaseResult<RosterView | null>> {
  const decision = can(actor, 'voting.process.read', { kind: 'AssemblyRosterSnapshot' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  return await leerPadron(db().assemblyRosterSnapshot.findUnique({
    where: { electionId },
    select: {
      id: true,
      frozenAt: true,
      entryCount: true,
      hash: true,
      criteria: true,
      entries: {
        select: {
          membershipId: true,
          memberNumber: true,
          territorialUnitId: true,
          hasVoice: true,
          hasVote: true,
        },
      },
    },
  }));
}

interface PadronCrudo {
  readonly id: string;
  readonly frozenAt: Date;
  readonly entryCount: number;
  readonly hash: string;
  readonly criteria: unknown;
  readonly entries: readonly RosterEntryShape[];
}

/**
 * Compone la vista de un padrón y **recalcula su huella**.
 *
 * Está factorizada porque la asamblea y la elección la necesitan igual, y una
 * comprobación de integridad escrita dos veces es una que tarde o temprano se
 * corrige solo en una de las dos copias.
 */
async function leerPadron(consulta: Promise<PadronCrudo | null>): Promise<UseCaseResult<RosterView | null>> {
  const snapshot = await consulta;
  if (snapshot === null) return ok(null);

  const recomputedHash = huellaDePadron(snapshot.entries);

  return ok({
    rosterId: snapshot.id,
    frozenAt: snapshot.frozenAt,
    entryCount: snapshot.entryCount,
    withVote: snapshot.entries.filter((entrada) => entrada.hasVote).length,
    hash: snapshot.hash,
    recomputedHash,
    intact: recomputedHash === snapshot.hash && snapshot.entries.length === snapshot.entryCount,
    criteria: snapshot.criteria,
  });
}

export const freezeElectionRosterSchema = z.object({ electionId: z.uuid() });

/**
 * Congela el padrón electoral de un proceso (F5-ELE-002).
 *
 * Es el mismo acto que congelar el padrón de una asamblea y por eso comparte
 * tabla, función y huella: lo que cambia es de qué acto es el padrón. Tenerlo
 * separado en otra tabla habría duplicado la garantía de inmutabilidad, y una
 * garantía duplicada es una que tarde o temprano se aplica solo en una de las
 * dos copias.
 */
export async function freezeElectionRoster(
  actor: ActorContext,
  input: z.infer<typeof freezeElectionRosterSchema>,
): Promise<UseCaseResult<FrozenRoster>> {
  const parsed = freezeElectionRosterSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'election.roster.publish', { kind: 'AssemblyRosterSnapshot' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienCongela = actor.userId;
  if (quienCongela === null || quienCongela === undefined) {
    return fail(errors.forbidden('Congelar el padrón electoral es un acto de una persona: exige una cuenta.'));
  }

  const eleccion = await db().election.findUnique({
    where: { id: parsed.data.electionId },
    select: {
      id: true,
      publicId: true,
      status: true,
      territorialUnitId: true,
      territorialUnit: { select: { path: true } },
      normativeRuleSet: { select: { version: true } },
      rosterSnapshot: { select: { id: true } },
    },
  });
  if (eleccion === null) return fail(errors.notFound('Ese proceso electoral no existe.'));
  if (eleccion.rosterSnapshot !== null) {
    return fail(errors.conflict('El padrón electoral de este proceso ya está congelado.'));
  }
  if (eleccion.status === 'PLANNED') {
    return fail(errors.conflict('Primero se convoca. El padrón electoral se congela sobre un proceso convocado.'));
  }
  if (eleccion.status === 'ANNULLED' || eleccion.status === 'CLOSED') {
    return fail(errors.conflict('Ese proceso está terminado.'));
  }

  const congeladoEl = new Date();
  const entradas = await membresiasElegibles(db(), eleccion.territorialUnit.path, congeladoEl);
  if (entradas.length === 0) {
    return fail(errors.conflict('No hay ninguna membresía elegible en el alcance territorial del proceso.'));
  }

  const hash = huellaDePadron(entradas);
  const criteria: RosterCriteria = {
    territorialPath: eleccion.territorialUnit.path,
    includesDescendants: true,
    membershipStatus: ['ACTIVE'],
    category: 'UNION_MEMBER',
    requiresPoliticalRights: false,
    frozenAtIso: congeladoEl.toISOString(),
    normativeVersion: eleccion.normativeRuleSet.version,
  };

  const congelado = await transaction(async (tx) => {
    const snapshot = await tx.assemblyRosterSnapshot.create({
      data: {
        ownerKind: 'ELECTION',
        electionId: eleccion.id,
        frozenAt: congeladoEl,
        frozenById: quienCongela,
        criteria: { ...criteria, membershipStatus: [...criteria.membershipStatus] },
        entryCount: entradas.length,
        hash,
      },
      select: { id: true },
    });

    await tx.assemblyRosterEntry.createMany({
      data: entradas.map((entrada) => ({
        rosterId: snapshot.id,
        membershipId: entrada.membershipId,
        memberNumber: entrada.memberNumber,
        territorialUnitId: entrada.territorialUnitId,
        hasVoice: entrada.hasVoice,
        hasVote: entrada.hasVote,
      })),
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ROSTER_FROZEN,
      objectKind: 'AssemblyRosterSnapshot',
      objectId: snapshot.id,
      outcome: 'SUCCESS',
      territorialUnitId: eleccion.territorialUnitId,
      metadata: {
        eleccion: eleccion.publicId,
        entradas: entradas.length,
        conVoto: entradas.filter((entrada) => entrada.hasVote).length,
        hash,
      },
    });

    return snapshot;
  });

  return ok({
    rosterId: congelado.id,
    entryCount: entradas.length,
    withVote: entradas.filter((entrada) => entrada.hasVote).length,
    hash,
  });
}

/**
 * Congela el padrón de agremiados afectados por una consulta de contrato
 * colectivo (F5-NEG-002).
 *
 * No pertenece ni a una asamblea ni a una elección: la consulta lo referencia
 * desde su expediente. Por eso su `ownerKind` es el de consulta y las dos
 * columnas de dueño quedan nulas, que es exactamente lo que la base comprueba.
 */
export async function freezeConsultationRoster(
  actor: ActorContext,
  territorialPath: string,
  normativeVersion: string,
  territorialUnitId: string,
): Promise<UseCaseResult<FrozenRoster>> {
  const quienCongela = actor.userId;
  if (quienCongela === null || quienCongela === undefined) {
    return fail(errors.forbidden('Congelar el padrón de una consulta es un acto de una persona: exige una cuenta.'));
  }

  const congeladoEl = new Date();
  const entradas = await membresiasElegibles(db(), territorialPath, congeladoEl);
  if (entradas.length === 0) {
    return fail(errors.conflict('No hay agremiados afectados en el alcance de la consulta.'));
  }

  const hash = huellaDePadron(entradas);
  const criteria: RosterCriteria = {
    territorialPath,
    includesDescendants: true,
    membershipStatus: ['ACTIVE'],
    category: 'UNION_MEMBER',
    requiresPoliticalRights: false,
    frozenAtIso: congeladoEl.toISOString(),
    normativeVersion,
  };

  const congelado = await transaction(async (tx) => {
    const snapshot = await tx.assemblyRosterSnapshot.create({
      data: {
        ownerKind: 'COLLECTIVE_CONSULTATION',
        frozenAt: congeladoEl,
        frozenById: quienCongela,
        criteria: { ...criteria, membershipStatus: [...criteria.membershipStatus] },
        entryCount: entradas.length,
        hash,
      },
      select: { id: true },
    });

    await tx.assemblyRosterEntry.createMany({
      data: entradas.map((entrada) => ({
        rosterId: snapshot.id,
        membershipId: entrada.membershipId,
        memberNumber: entrada.memberNumber,
        territorialUnitId: entrada.territorialUnitId,
        hasVoice: entrada.hasVoice,
        hasVote: entrada.hasVote,
      })),
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ROSTER_FROZEN,
      objectKind: 'AssemblyRosterSnapshot',
      objectId: snapshot.id,
      outcome: 'SUCCESS',
      territorialUnitId,
      metadata: { consulta: true, entradas: entradas.length, hash },
    });

    return snapshot;
  });

  return ok({
    rosterId: congelado.id,
    entryCount: entradas.length,
    withVote: entradas.filter((entrada) => entrada.hasVote).length,
    hash,
  });
}

export interface RosterEntryRow {
  readonly memberNumber: string;
  readonly personName: string;
  readonly territory: string | null;
  readonly hasVoice: boolean;
  readonly hasVote: boolean;
}

/** Entradas nominales de un padrón congelado, para publicarlo y consultarlo. */
export async function rosterEntries(
  actor: ActorContext,
  rosterId: string,
): Promise<UseCaseResult<readonly RosterEntryRow[]>> {
  const decision = can(actor, 'membership.roster.read', { kind: 'AssemblyRosterEntry' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().assemblyRosterEntry.findMany({
    where: { rosterId },
    orderBy: { memberNumber: 'asc' },
    select: {
      memberNumber: true,
      hasVoice: true,
      hasVote: true,
      membership: {
        select: {
          territorialUnit: { select: { name: true } },
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      memberNumber: fila.memberNumber,
      personName: nombreCompleto(fila.membership.person),
      territory: fila.membership.territorialUnit?.name ?? null,
      hasVoice: fila.hasVoice,
      hasVote: fila.hasVote,
    })),
  );
}
