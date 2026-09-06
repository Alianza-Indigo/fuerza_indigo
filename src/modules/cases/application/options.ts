import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { CAMPOS_PARA_DECIDIR, estaAsignada, recursoDelExpediente } from './assignment';

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
  const expediente = await db().case.findUnique({ where: { id: caseId }, select: CAMPOS_PARA_DECIDIR });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));

  const asignada = await estaAsignada(actor, expediente.id);
  const decision = can(
    { ...actor, reason: 'consulta de personas para el expediente' },
    'cases.participant.manage',
    { ...recursoDelExpediente(expediente), kind: 'CaseParticipant' },
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

/**
 * Entidades que pueden recibir una canalización.
 *
 * **Todas las activas**, no solo aquellas donde quien pregunta tiene
 * facultades: canalizar es precisamente mandar un asunto a donde no se llega,
 * y una lista acotada a lo propio dejaría fuera el único destino que importa.
 * Lo que sí se comprueba es que quien pregunta pueda canalizar **este**
 * expediente.
 */
export async function entitiesForReferral(
  actor: ActorContext,
  caseId: string,
): Promise<UseCaseResult<readonly Opcion[]>> {
  const expediente = await db().case.findUnique({ where: { id: caseId }, select: CAMPOS_PARA_DECIDIR });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));

  const asignada = await estaAsignada(actor, expediente.id);
  // La facultad de canalizar exige motivo, y consultar a dónde se podría
  // canalizar es parte del acto: el motivo de la consulta es la consulta. El
  // que cuenta se escribe al proponer.
  const decision = can(
    { ...actor, reason: 'consulta de entidades a las que se podría canalizar' },
    'cases.referral.propose',
    recursoDelExpediente(expediente),
    { hasLiveAssignment: () => asignada },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = await db().legalEntity.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, shortName: true },
  });

  return ok(entidades.map((entidad) => ({ value: entidad.id, label: entidad.shortName })));
}
