import { createHash } from 'node:crypto';
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

/**
 * Publicación del padrón electoral y exportación de evidencia
 * (PRD §9.6; F5-ELE-002, F5-ELE-006).
 *
 * **La exportación no inventa nada.** Reúne lo que ya consta —el calendario, la
 * comisión con sus declaraciones, el padrón con su huella, las planillas con sus
 * resoluciones, el escrutinio y las incidencias— y le pone una huella propia.
 * Lo que la autoridad recibe se puede contrastar, dato por dato, con lo que la
 * plataforma guarda.
 *
 * **No contiene boletas.** Ni sus códigos de verificación asociados a nadie, ni
 * nada que permita reconstruir el sentido de un voto: el expediente prueba que
 * el proceso fue regular, no qué votó cada quien.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const publishElectoralRollSchema = z.object({ electionId: z.uuid() });

/**
 * Publica el padrón electoral congelado.
 *
 * Publicar abre el plazo de impugnación: quien no aparezca, o aparezca sin voto
 * cuando cree que le corresponde, plantea una incidencia de elegibilidad. Por
 * eso publicar sin haber congelado no tiene sentido: se estaría publicando algo
 * que aún cambia.
 */
export async function publishElectoralRoll(
  actor: ActorContext,
  input: z.infer<typeof publishElectoralRollSchema>,
): Promise<UseCaseResult<{ publishedAt: Date; entryCount: number; hash: string }>> {
  const parsed = publishElectoralRollSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'election.roster.publish', { kind: 'Election' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const eleccion = await db().election.findUnique({
    where: { id: parsed.data.electionId },
    select: {
      id: true,
      publicId: true,
      rosterPublishedAt: true,
      territorialUnitId: true,
      rosterSnapshot: { select: { id: true, entryCount: true, hash: true } },
    },
  });
  if (eleccion === null) return fail(errors.notFound('Ese proceso electoral no existe.'));
  const padron = eleccion.rosterSnapshot;
  if (padron === null) {
    return fail(
      errors.conflict('El padrón electoral no está congelado. Publicar antes sería publicar algo que todavía cambia.'),
    );
  }
  if (eleccion.rosterPublishedAt !== null) {
    return fail(errors.conflict('El padrón de este proceso ya está publicado.'));
  }

  const publicadoEl = new Date();
  await transaction(async (tx) => {
    await tx.election.update({
      where: { id: eleccion.id },
      data: { rosterPublishedAt: publicadoEl, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ELECTORAL_ROSTER_PUBLISHED,
      objectKind: 'Election',
      objectId: eleccion.id,
      outcome: 'SUCCESS',
      territorialUnitId: eleccion.territorialUnitId,
      metadata: {
        eleccion: eleccion.publicId,
        entradas: padron.entryCount,
        huella: padron.hash,
      },
    });
  });

  return ok({ publishedAt: publicadoEl, entryCount: padron.entryCount, hash: padron.hash });
}

export interface ElectionEvidence {
  readonly generatedAt: string;
  readonly election: {
    readonly publicId: string;
    readonly name: string;
    readonly body: string;
    readonly territory: string;
    readonly status: string;
    readonly normativeVersion: string;
    readonly calendar: unknown;
  };
  readonly commission: readonly {
    readonly person: string;
    readonly noCandidacyDeclared: boolean;
    readonly declaredAt: string | null;
  }[];
  readonly roll: {
    readonly frozenAt: string;
    readonly entryCount: number;
    readonly withVote: number;
    readonly hash: string;
    readonly publishedAt: string | null;
  } | null;
  readonly slates: readonly {
    readonly name: string;
    readonly status: string;
    readonly registeredAt: string;
    readonly rejectionReason: string | null;
    readonly warnings: unknown;
    readonly genderComposition: unknown;
    readonly members: readonly { readonly person: string; readonly office: string; readonly substitute: boolean }[];
  }[];
  readonly tally: {
    readonly method: string;
    readonly status: string;
    readonly opensAt: string;
    readonly closesAt: string;
    readonly talliedAt: string | null;
    readonly results: unknown;
    readonly keyDestroyed: boolean;
  } | null;
  readonly incidents: readonly {
    readonly kind: string;
    readonly status: string;
    readonly reportedAt: string;
    readonly description: string;
    readonly resolution: string | null;
  }[];
  /** `sha256` del expediente sin esta línea. Permite comprobar que no cambió. */
  readonly hash: string;
}

export const exportElectionEvidenceSchema = z.object({
  electionId: z.uuid(),
  reason: z.string().trim().min(10).max(400),
});

/**
 * Reúne el expediente electoral para la autoridad laboral.
 *
 * Devuelve un objeto serializable y su huella. Quien lo reciba puede volver a
 * calcularla sobre el contenido y comprobar que es el mismo expediente que se
 * exportó, sin tener que confiar en el archivo que le llegó.
 */
export async function exportElectionEvidence(
  actor: ActorContext,
  input: z.infer<typeof exportElectionEvidenceSchema>,
): Promise<UseCaseResult<ElectionEvidence>> {
  const parsed = exportElectionEvidenceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const contexto = { ...actor, reason: parsed.data.reason };
  const decision = can(contexto, 'election.evidence.export', { kind: 'Election' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const eleccion = await db().election.findUnique({
    where: { id: parsed.data.electionId },
    select: {
      id: true,
      publicId: true,
      name: true,
      status: true,
      calendar: true,
      rosterPublishedAt: true,
      territorialUnitId: true,
      unionBody: { select: { name: true } },
      territorialUnit: { select: { name: true } },
      normativeRuleSet: { select: { version: true } },
      commissionMembers: {
        select: {
          noCandidacyDeclared: true,
          declaredAt: true,
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
      rosterSnapshot: {
        select: {
          frozenAt: true,
          entryCount: true,
          hash: true,
          entries: { select: { hasVote: true } },
        },
      },
      slates: {
        orderBy: { registeredAt: 'asc' },
        select: {
          name: true,
          status: true,
          registeredAt: true,
          rejectionReason: true,
          complianceWarnings: true,
          genderComposition: true,
          members: {
            orderBy: { position: 'asc' },
            select: {
              isSubstitute: true,
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
          },
        },
      },
      voteProcess: {
        select: {
          method: true,
          status: true,
          opensAt: true,
          closesAt: true,
          talliedAt: true,
          results: true,
          credentialSalt: true,
        },
      },
      incidents: {
        orderBy: { reportedAt: 'asc' },
        select: { kind: true, status: true, reportedAt: true, description: true, resolution: true },
      },
    },
  });
  if (eleccion === null) return fail(errors.notFound('Ese proceso electoral no existe.'));

  const sinHuella: Omit<ElectionEvidence, 'hash'> = {
    generatedAt: new Date().toISOString(),
    election: {
      publicId: eleccion.publicId,
      name: eleccion.name,
      body: eleccion.unionBody.name,
      territory: eleccion.territorialUnit.name,
      status: eleccion.status,
      normativeVersion: eleccion.normativeRuleSet.version,
      calendar: eleccion.calendar,
    },
    commission: eleccion.commissionMembers.map((integrante) => ({
      person: nombreCompleto(integrante.person),
      noCandidacyDeclared: integrante.noCandidacyDeclared,
      declaredAt: integrante.declaredAt?.toISOString() ?? null,
    })),
    roll:
      eleccion.rosterSnapshot === null
        ? null
        : {
            frozenAt: eleccion.rosterSnapshot.frozenAt.toISOString(),
            entryCount: eleccion.rosterSnapshot.entryCount,
            withVote: eleccion.rosterSnapshot.entries.filter((entrada) => entrada.hasVote).length,
            hash: eleccion.rosterSnapshot.hash,
            publishedAt: eleccion.rosterPublishedAt?.toISOString() ?? null,
          },
    slates: eleccion.slates.map((planilla) => ({
      name: planilla.name,
      status: planilla.status,
      registeredAt: planilla.registeredAt.toISOString(),
      rejectionReason: planilla.rejectionReason,
      warnings: planilla.complianceWarnings,
      genderComposition: planilla.genderComposition,
      members: planilla.members.map((integrante) => ({
        person: nombreCompleto(integrante.person),
        office: integrante.officeDefinition.name,
        substitute: integrante.isSubstitute,
      })),
    })),
    tally:
      eleccion.voteProcess === null
        ? null
        : {
            method: eleccion.voteProcess.method,
            status: eleccion.voteProcess.status,
            opensAt: eleccion.voteProcess.opensAt.toISOString(),
            closesAt: eleccion.voteProcess.closesAt.toISOString(),
            talliedAt: eleccion.voteProcess.talliedAt?.toISOString() ?? null,
            results: eleccion.voteProcess.results,
            keyDestroyed: eleccion.voteProcess.credentialSalt === null,
          },
    incidents: eleccion.incidents.map((incidencia) => ({
      kind: incidencia.kind,
      status: incidencia.status,
      reportedAt: incidencia.reportedAt.toISOString(),
      description: incidencia.description,
      resolution: incidencia.resolution,
    })),
  };

  const hash = createHash('sha256').update(JSON.stringify(sinHuella), 'utf8').digest('hex');

  await transaction(async (tx) => {
    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.ELECTION_EVIDENCE_EXPORTED,
      objectKind: 'Election',
      objectId: eleccion.id,
      outcome: 'SUCCESS',
      territorialUnitId: eleccion.territorialUnitId,
      reason: parsed.data.reason,
      metadata: {
        eleccion: eleccion.publicId,
        planillas: eleccion.slates.length,
        incidencias: eleccion.incidents.length,
        huella: hash,
      },
    });
  });

  return ok({ ...sinHuella, hash });
}
