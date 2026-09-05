import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { membershipByCredential } from '@/modules/membership';
import type { AttendanceMethod, CallOrdinal, QuorumRule } from '@prisma-client/enums';
import { huellaDePadron } from './roster';

/**
 * Asistencia y quórum (PRD §9.4; F5-ASA-004, F5-ASA-005).
 *
 * **Quien no está en el padrón congelado no asiste.** No es una restricción de
 * interfaz: la asistencia copia `hasVoice` y `hasVote` **de la entrada del
 * padrón**, no del estado de la membresía hoy. Si alguien causa baja entre el
 * congelamiento y la sesión, sigue contando como estaba; si alguien se afilia
 * después, no entra. Esa es exactamente la propiedad que hace reproducible el
 * quórum: se puede recalcular años después con el padrón guardado y sale igual.
 *
 * **El quórum lo declara una persona.** El sistema calcula, enseña el cálculo y
 * lo firma con nombre; quien declara responde. Un sistema que «declara quórum»
 * solo desplaza la responsabilidad a un lugar donde nadie puede asumirla.
 *
 * **Con qué convocatoria se instala.** Primera y segunda tienen bases de quórum
 * distintas, así que la declaración dice cuál se usó y el cálculo se hace con la
 * base de esa convocatoria, no con la de la otra.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const registerAttendanceSchema = z
  .object({
    assemblyId: z.uuid(),
    method: z.enum(['QR_CREDENTIAL', 'MANUAL', 'REMOTE_SESSION']),
    /** Para el registro manual y el remoto. */
    membershipId: z.uuid().nullable().default(null),
    /** Para la lectura de la credencial. */
    credentialToken: z.string().trim().max(400).nullable().default(null),
  })
  .refine((valor) => valor.membershipId !== null || valor.credentialToken !== null, {
    error: () => 'Hace falta la credencial leída o la membresía elegida.',
    path: ['membershipId'],
  });

export type RegisterAttendanceInput = z.infer<typeof registerAttendanceSchema>;

export interface AttendanceResult {
  readonly attendanceId: string;
  readonly personName: string;
  readonly memberNumber: string;
  readonly hasVoice: boolean;
  readonly hasVote: boolean;
  readonly present: number;
}

export async function registerAttendance(
  actor: ActorContext,
  input: RegisterAttendanceInput,
): Promise<UseCaseResult<AttendanceResult>> {
  const parsed = registerAttendanceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.attendance.register', { kind: 'Attendance' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  const asamblea = await db().assembly.findUnique({
    where: { id: data.assemblyId },
    select: {
      id: true,
      publicId: true,
      status: true,
      modality: true,
      territorialUnitId: true,
      rosterSnapshot: { select: { id: true } },
    },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));
  if (asamblea.rosterSnapshot === null) {
    return fail(
      errors.conflict('El padrón todavía no está congelado. La asistencia se registra contra el padrón de la sesión.'),
    );
  }
  if (asamblea.status === 'CANCELLED') return fail(errors.conflict('Esa asamblea está cancelada.'));
  if (asamblea.status === 'CLOSED' || asamblea.status === 'PUBLISHED') {
    return fail(errors.conflict('Esa asamblea ya se cerró. La asistencia no se registra después.'));
  }
  if (data.method === 'REMOTE_SESSION' && asamblea.modality === 'IN_PERSON') {
    return fail(
      errors.conflict('La sesión es presencial. Registrar asistencia remota diría que alguien estuvo donde no estuvo.'),
    );
  }

  let membershipId = data.membershipId;

  if (data.credentialToken !== null) {
    const titular = await membershipByCredential(actor, data.credentialToken);
    if (!titular.ok) return fail(titular.error);
    if (titular.data === null) {
      return fail(errors.notFound('Esa credencial no corresponde a ninguna membresía.'));
    }
    if (titular.data.credentialStatus !== 'ACTIVE') {
      return fail(
        errors.conflict(
          `La credencial no está vigente (${titular.data.credentialStatus}). Registra la asistencia a mano tras comprobar la identidad de otra forma.`,
        ),
      );
    }
    membershipId = titular.data.membershipId;
  }

  if (membershipId === null) {
    return fail(errors.validation({ membershipId: ['Hace falta la membresía.'] }));
  }

  // La entrada del padrón es la fuente de la voz y del voto. No se vuelve a
  // mirar el estado de la membresía: el padrón ya decidió, y decidió antes.
  const entrada = await db().assemblyRosterEntry.findUnique({
    where: { rosterId_membershipId: { rosterId: asamblea.rosterSnapshot.id, membershipId } },
    select: {
      membershipId: true,
      memberNumber: true,
      hasVoice: true,
      hasVote: true,
      membership: {
        select: {
          personId: true,
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
    },
  });
  if (entrada === null) {
    return fail(
      errors.conflict(
        'Esa persona no está en el padrón congelado de la sesión. Solo asiste quien estaba en el padrón al congelarlo.',
      ),
    );
  }

  const yaRegistrada = await db().attendance.findUnique({
    where: { assemblyId_membershipId: { assemblyId: asamblea.id, membershipId } },
    select: { id: true },
  });
  if (yaRegistrada !== null) {
    return fail(errors.conflict('Esa asistencia ya está registrada.'));
  }

  const registrada = await transaction(async (tx) => {
    const fila = await tx.attendance.create({
      data: {
        assemblyId: asamblea.id,
        membershipId,
        personId: entrada.membership.personId,
        method: data.method,
        hasVoice: entrada.hasVoice,
        hasVote: entrada.hasVote,
        registeredById: actor.userId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ATTENDANCE_REGISTERED,
      objectKind: 'Attendance',
      objectId: fila.id,
      outcome: 'SUCCESS',
      territorialUnitId: asamblea.territorialUnitId,
      metadata: {
        asamblea: asamblea.publicId,
        numeroDeMiembro: entrada.memberNumber,
        metodo: data.method,
        conVoto: entrada.hasVote,
      },
    });

    return fila;
  });

  const present = await db().attendance.count({ where: { assemblyId: asamblea.id, leftAt: null } });

  return ok({
    attendanceId: registrada.id,
    personName: nombreCompleto(entrada.membership.person),
    memberNumber: entrada.memberNumber,
    hasVoice: entrada.hasVoice,
    hasVote: entrada.hasVote,
    present,
  });
}

export interface QuorumComputation {
  /** Convocatoria con la que se calcula. */
  readonly ordinal: CallOrdinal;
  readonly rule: QuorumRule;
  /** Personas en el padrón congelado. */
  readonly rosterSize: number;
  /** Presentes registrados que no se han retirado. */
  readonly present: number;
  /** Presentes con derecho a voto. */
  readonly presentWithVote: number;
  /** Cuántas hacen falta según la regla. Nulo cuando la regla son «los presentes». */
  readonly required: number | null;
  readonly reached: boolean;
  readonly rosterHash: string;
  readonly rosterIntact: boolean;
  readonly declaredAt: Date | null;
  readonly declaredBy: string | null;
}

/**
 * Calcula el quórum sobre el padrón congelado.
 *
 * Es una consulta, no un acto: se puede pedir cuantas veces haga falta durante
 * la sesión, y su resultado no cambia nada. Devuelve además si la huella del
 * padrón sigue correspondiendo con sus entradas, porque un quórum calculado
 * sobre un padrón alterado no valdría aunque la aritmética fuera correcta.
 */
export async function computeQuorum(
  actor: ActorContext,
  assemblyId: string,
  ordinal?: CallOrdinal,
): Promise<UseCaseResult<QuorumComputation | null>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'Assembly' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const asamblea = await db().assembly.findUnique({
    where: { id: assemblyId },
    select: {
      id: true,
      quorumDeclaredAt: true,
      quorumBase: true,
      quorumPresent: true,
      callUsedId: true,
      quorumDeclaredBy: {
        select: {
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
      calls: { orderBy: { issuedAt: 'asc' }, select: { id: true, ordinal: true, quorumRule: true } },
      rosterSnapshot: {
        select: {
          id: true,
          hash: true,
          entryCount: true,
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
      },
    },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));
  if (asamblea.rosterSnapshot === null) return ok(null);
  if (asamblea.calls.length === 0) return ok(null);

  // Sin indicación, se toma la última convocatoria emitida: es la que rige la
  // instalación de la sesión.
  const convocatoria =
    ordinal === undefined
      ? asamblea.calls[asamblea.calls.length - 1]!
      : (asamblea.calls.find((call) => call.ordinal === ordinal) ?? null);
  if (convocatoria === null) return ok(null);

  const [present, presentWithVote] = await Promise.all([
    db().attendance.count({ where: { assemblyId: asamblea.id, leftAt: null } }),
    db().attendance.count({ where: { assemblyId: asamblea.id, leftAt: null, hasVote: true } }),
  ]);

  const rosterSize = asamblea.rosterSnapshot.entryCount;
  const required = convocatoria.quorumRule === 'HALF_PLUS_ONE' ? Math.floor(rosterSize / 2) + 1 : null;
  const recalculada = huellaDePadron(asamblea.rosterSnapshot.entries);

  return ok({
    ordinal: convocatoria.ordinal,
    rule: convocatoria.quorumRule,
    rosterSize,
    present,
    presentWithVote,
    required,
    // Con «los presentes», basta que haya alguien: una sesión sin nadie no se
    // instala, y decir que sí sería el mayor absurdo posible.
    reached: required === null ? present > 0 : present >= required,
    rosterHash: asamblea.rosterSnapshot.hash,
    rosterIntact:
      recalculada === asamblea.rosterSnapshot.hash &&
      asamblea.rosterSnapshot.entries.length === asamblea.rosterSnapshot.entryCount,
    declaredAt: asamblea.quorumDeclaredAt,
    declaredBy:
      asamblea.quorumDeclaredBy === null ? null : nombreCompleto(asamblea.quorumDeclaredBy.person),
  });
}

export const declareQuorumSchema = z.object({
  assemblyId: z.uuid(),
  ordinal: z.enum(['FIRST', 'SECOND']),
});

export interface QuorumDeclaration {
  readonly reached: boolean;
  readonly base: number;
  readonly present: number;
  readonly required: number | null;
  readonly rosterHash: string;
}

/**
 * Declara el quórum e instala la sesión.
 *
 * Guarda el cálculo tal como quedó —base y presentes— además de la firma de
 * quien declara. Guardar solo «sí hubo quórum» obligaría a recalcularlo después
 * para saber con qué números se dijo, y recalcular es justamente lo que no se
 * puede hacer con confianza meses más tarde.
 *
 * Se niega cuando el padrón no está íntegro: declarar quórum sobre un padrón
 * cuya huella no corresponde sería certificar un número que ya nadie puede
 * comprobar.
 */
export async function declareQuorum(
  actor: ActorContext,
  input: z.infer<typeof declareQuorumSchema>,
): Promise<UseCaseResult<QuorumDeclaration>> {
  const parsed = declareQuorumSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.quorum.declare', { kind: 'Assembly' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienDeclara = actor.userId;
  if (quienDeclara === null || quienDeclara === undefined) {
    return fail(errors.forbidden('El quórum lo declara una persona con cuenta, y responde por él.'));
  }

  const asamblea = await db().assembly.findUnique({
    where: { id: parsed.data.assemblyId },
    select: {
      id: true,
      publicId: true,
      status: true,
      quorumDeclaredAt: true,
      territorialUnitId: true,
      calls: { select: { id: true, ordinal: true } },
    },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));
  if (asamblea.quorumDeclaredAt !== null) {
    return fail(errors.conflict('El quórum de esta sesión ya está declarado.'));
  }
  if (asamblea.status === 'CANCELLED') return fail(errors.conflict('Esa asamblea está cancelada.'));

  const convocatoria = asamblea.calls.find((call) => call.ordinal === parsed.data.ordinal);
  if (convocatoria === undefined) {
    return fail(errors.conflict('Esa convocatoria no se emitió. No se instala una sesión con una convocatoria que no salió.'));
  }

  const calculado = await computeQuorum(actor, asamblea.id, parsed.data.ordinal);
  if (!calculado.ok) return fail(calculado.error);
  if (calculado.data === null) {
    return fail(errors.conflict('No hay padrón congelado ni convocatoria con la que calcular el quórum.'));
  }
  const calculo = calculado.data;
  if (!calculo.rosterIntact) {
    return fail(
      errors.conflict(
        'La huella del padrón no corresponde con sus entradas. No se declara quórum sobre un padrón que no se puede comprobar.',
      ),
    );
  }
  if (!calculo.reached) {
    return fail(
      errors.conflict(
        calculo.required === null
          ? 'No hay nadie presente. Una sesión sin asistentes no se instala.'
          : `Hacen falta ${calculo.required} presentes y hay ${calculo.present}. Si la primera convocatoria no reúne quórum, emite la segunda.`,
      ),
    );
  }

  const declaradoEl = new Date();
  await transaction(async (tx) => {
    await tx.assembly.update({
      where: { id: asamblea.id },
      data: {
        status: 'IN_SESSION',
        quorumDeclaredAt: declaradoEl,
        quorumDeclaredById: quienDeclara,
        quorumBase: calculo.rosterSize,
        quorumPresent: calculo.present,
        callUsedId: convocatoria.id,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.QUORUM_DECLARED,
      objectKind: 'Assembly',
      objectId: asamblea.id,
      outcome: 'SUCCESS',
      territorialUnitId: asamblea.territorialUnitId,
      metadata: {
        asamblea: asamblea.publicId,
        convocatoria: parsed.data.ordinal,
        regla: calculo.rule,
        base: calculo.rosterSize,
        presentes: calculo.present,
        exigidos: calculo.required,
        huellaDelPadron: calculo.rosterHash,
      },
    });
  });

  return ok({
    reached: true,
    base: calculo.rosterSize,
    present: calculo.present,
    required: calculo.required,
    rosterHash: calculo.rosterHash,
  });
}

export interface AttendanceRow {
  readonly id: string;
  readonly personName: string;
  readonly memberNumber: string;
  readonly method: AttendanceMethod;
  readonly registeredAt: Date;
  readonly hasVoice: boolean;
  readonly hasVote: boolean;
  readonly leftAt: Date | null;
}

export async function attendanceList(
  actor: ActorContext,
  assemblyId: string,
): Promise<UseCaseResult<readonly AttendanceRow[]>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'Attendance' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().attendance.findMany({
    where: { assemblyId },
    orderBy: { registeredAt: 'asc' },
    select: {
      id: true,
      method: true,
      registeredAt: true,
      hasVoice: true,
      hasVote: true,
      leftAt: true,
      membership: { select: { memberNumber: true } },
      person: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      personName: nombreCompleto(fila.person),
      memberNumber: fila.membership.memberNumber,
      method: fila.method,
      registeredAt: fila.registeredAt,
      hasVoice: fila.hasVoice,
      hasVote: fila.hasVote,
      leftAt: fila.leftAt,
    })),
  );
}

export interface PendingAttendee {
  readonly membershipId: string;
  readonly memberNumber: string;
  readonly personName: string;
  readonly hasVote: boolean;
}

/**
 * Personas del padrón congelado que todavía no han registrado asistencia.
 *
 * La lista existe para que el registro manual no obligue a teclear un número de
 * miembro, y para que no ofrezca a quien ya está registrado: repetir una
 * asistencia falla contra el índice único, y fallar después de elegir a alguien
 * en una mesa de registro con gente esperando es la peor forma de descubrirlo.
 */
export async function pendingAttendees(
  actor: ActorContext,
  assemblyId: string,
): Promise<UseCaseResult<readonly PendingAttendee[]>> {
  const decision = can(actor, 'assembly.attendance.register', { kind: 'Attendance' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const asamblea = await db().assembly.findUnique({
    where: { id: assemblyId },
    select: { id: true, rosterSnapshot: { select: { id: true } } },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));
  if (asamblea.rosterSnapshot === null) return ok([]);

  const [entradas, registradas] = await Promise.all([
    db().assemblyRosterEntry.findMany({
      where: { rosterId: asamblea.rosterSnapshot.id },
      orderBy: { memberNumber: 'asc' },
      select: {
        membershipId: true,
        memberNumber: true,
        hasVote: true,
        membership: {
          select: {
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
        },
      },
    }),
    db().attendance.findMany({ where: { assemblyId: asamblea.id }, select: { membershipId: true } }),
  ]);

  const yaEstan = new Set(registradas.map((fila) => fila.membershipId));

  return ok(
    entradas
      .filter((entrada) => !yaEstan.has(entrada.membershipId))
      .map((entrada) => ({
        membershipId: entrada.membershipId,
        memberNumber: entrada.memberNumber,
        personName: nombreCompleto(entrada.membership.person),
        hasVote: entrada.hasVote,
      })),
  );
}
