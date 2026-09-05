import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { PERMISSIONS } from '@/platform/authz/permissions';

/**
 * Listas para los formularios de gobierno.
 *
 * Cada una devuelve **solo lo que el caso de uso va a aceptar**. Un desplegable
 * con opciones que siempre fallan es un botón sin acción (PRD §0.3), y aquí
 * fallaría tarde: después de que alguien escribiera el motivo del nombramiento.
 */

export interface Opcion {
  readonly value: string;
  readonly label: string;
}

/**
 * Membresías que pueden ocupar un cargo.
 *
 * Solo agremiados **en pleno goce de derechos**: la calidad tiene que conceder
 * derechos políticos, la membresía tiene que estar activa y no puede tener los
 * derechos suspendidos. Es la misma comprobación que hace `appointOffice`; aquí
 * se repite para no ofrecer a quien va a ser rechazado.
 */
export async function appointableMemberships(actor: ActorContext): Promise<UseCaseResult<readonly Opcion[]>> {
  const decision = can({ ...actor, reason: 'consulta de personas nombrables' }, 'governance.office.appoint', {
    kind: 'OfficeTerm',
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const filas = await db().membership.findMany({
    where: {
      status: 'ACTIVE',
      category: 'UNION_MEMBER',
      membershipType: { grantsPoliticalRights: true },
      OR: [{ politicalRightsSuspendedUntil: null }, { politicalRightsSuspendedUntil: { lt: ahora } }],
    },
    orderBy: { memberNumber: 'asc' },
    take: 500,
    select: {
      id: true,
      memberNumber: true,
      person: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
      },
    },
  });

  return ok(filas.map((fila) => ({ value: fila.id, label: `${nombreCompleto(fila.person)} · ${fila.memberNumber}` })));
}

/**
 * Personas a las que se puede apoderar.
 *
 * A diferencia de un cargo, una persona apoderada **no tiene por qué ser
 * agremiada**: un sindicato apodera a su abogacía externa para comparecer ante
 * la autoridad laboral. Por eso la lista es del registro de personas y no del
 * padrón.
 */
export async function grantablePeople(actor: ActorContext): Promise<UseCaseResult<readonly Opcion[]>> {
  const decision = can({ ...actor, reason: 'consulta de personas apoderables' }, 'governance.power.grant', {
    kind: 'PowerGrant',
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().person.findMany({
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
 * Catálogo de facultades para definir un cargo.
 *
 * Se lee del catálogo en código y no de la base porque es ahí donde vive la
 * descripción de cada permiso; la semilla las copia a la base, pero la base no
 * guarda más de lo que aquí se declara.
 */
export function permissionOptions(actor: ActorContext): UseCaseResult<readonly Opcion[]> {
  const decision = can(actor, 'governance.body.manage', { kind: 'OfficeDefinition' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  return ok(
    [...PERMISSIONS]
      .sort((a, b) => a.code.localeCompare(b.code, 'es'))
      .map((permiso) => ({ value: permiso.code, label: `${permiso.code} — ${permiso.description}` })),
  );
}

/**
 * Personas a las que se puede encargar el seguimiento de un acuerdo.
 *
 * Son quienes ocupan un cargo vigente y tienen cuenta: un acuerdo se encarga a
 * una secretaría, no a una persona cualquiera, y quien lo recibe tiene que
 * poder entrar a actualizar su estado.
 */
export async function followUpOwners(actor: ActorContext): Promise<UseCaseResult<readonly Opcion[]>> {
  const decision = can(actor, 'governance.body.read', { kind: 'OfficeTerm' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const filas = await db().officeTerm.findMany({
    where: { endedEarlyOn: null, endsOn: { gte: ahora } },
    orderBy: { endsOn: 'asc' },
    select: {
      officeDefinition: { select: { name: true } },
      person: {
        select: {
          givenName: true,
          middleName: true,
          familyName: true,
          secondFamilyName: true,
          preferredName: true,
          user: { select: { id: true, status: true } },
        },
      },
    },
  });

  const vistas = new Set<string>();
  const salida: Opcion[] = [];
  for (const fila of filas) {
    const cuenta = fila.person.user;
    if (cuenta === null || cuenta.status !== 'ACTIVE') continue;
    if (vistas.has(cuenta.id)) continue;
    vistas.add(cuenta.id);
    salida.push({ value: cuenta.id, label: `${nombreCompleto(fila.person)} · ${fila.officeDefinition.name}` });
  }

  return ok(salida);
}
