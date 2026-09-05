import { createHash } from 'node:crypto';
import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

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

export interface RosterEntryShape {
  readonly membershipId: string;
  readonly memberNumber: string;
  readonly territorialUnitId: string | null;
  readonly hasVoice: boolean;
  readonly hasVote: boolean;
}

/**
 * Huella canónica del padrón.
 *
 * Una línea por entrada, ordenadas por número de miembro, con los campos
 * separados por barra vertical. El orden es parte de la definición: sin él, dos
 * padrones idénticos producirían huellas distintas según el orden en que la
 * base devolviera las filas, y la comprobación no serviría de nada.
 *
 * Es una función pura y exportada a propósito: quien reciba el padrón la
 * ejecuta por su cuenta y compara. Una huella que solo puede calcular quien la
 * emitió no prueba nada.
 */
export function huellaDePadron(entradas: readonly RosterEntryShape[]): string {
  const canonico = [...entradas]
    .sort((a, b) => a.memberNumber.localeCompare(b.memberNumber, 'en'))
    .map(
      (entrada) =>
        `${entrada.memberNumber}|${entrada.membershipId}|${entrada.territorialUnitId ?? ''}|${entrada.hasVoice ? '1' : '0'}|${entrada.hasVote ? '1' : '0'}`,
    )
    .join('\n');
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
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

  const snapshot = await db().assemblyRosterSnapshot.findUnique({
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
  });
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
