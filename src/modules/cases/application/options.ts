import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { compartimentoDe } from '../domain/access';
import { estaAsignada } from './assignment';

export interface Opcion {
  readonly value: string;
  readonly label: string;
}

/**
 * Personas del registro que se pueden agregar a un expediente.
 *
 * Exige llevar **este** expediente, no una facultad general de consultar
 * personas: una lista de todo el padrón que se abriera con solo tener sesión
 * sería un directorio encubierto.
 */
export async function peopleForCase(
  actor: ActorContext,
  caseId: string,
): Promise<UseCaseResult<readonly Opcion[]>> {
  const expediente = await db().case.findUnique({
    where: { id: caseId },
    select: { id: true, domain: true, legalEntityId: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));

  const asignada = await estaAsignada(actor, expediente.id);
  const decision = can(
    { ...actor, reason: 'consulta de personas para el expediente' },
    'cases.participant.manage',
    {
      kind: 'CaseParticipant',
      id: expediente.id,
      legalEntityId: expediente.legalEntityId,
      compartment: compartimentoDe(expediente.domain),
    },
    { hasLiveAssignment: () => asignada },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const yaFiguran = await db().caseParticipant.findMany({
    where: { caseId: expediente.id, removedAt: null, personId: { not: null } },
    select: { personId: true },
  });
  const excluidas = yaFiguran.flatMap((fila) => (fila.personId === null ? [] : [fila.personId]));

  const filas = await db().person.findMany({
    where: excluidas.length === 0 ? {} : { id: { notIn: excluidas } },
    orderBy: [{ familyName: 'asc' }, { givenName: 'asc' }],
    take: 500,
    select: {
      id: true,
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      preferredName: true,
    },
  });

  return ok(filas.map((fila) => ({ value: fila.id, label: nombreCompleto(fila) })));
}
