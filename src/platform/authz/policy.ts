import type { Compartment } from '@prisma-client/enums';
import type { ActorContext, RoleAssignmentSnapshot } from '@/platform/kernel/actor-context';
import { JOB_GRANTS, permissionOrThrow, SUPERADMIN_GRANTED } from '@/platform/authz/permissions';

/**
 * Motor de políticas por roles y atributos (docs/PERMISSIONS.md §5.1).
 *
 * **Regla estructural:** no existe una vía rápida para ningún actor. El tipo de
 * actor determina de dónde salen sus permisos, nunca cuántas verificaciones
 * atraviesa. Todo actor —incluido el Superadmin raíz— recorre las mismas siete
 * comprobaciones, en el mismo orden, y hay un **único** punto de concesión.
 *
 * Esta propiedad es la corrección del defecto `D-F0-001` y la verifica tanto el
 * control `C-COH-04` del verificador de fase como las pruebas negativas.
 */

export type DenyReason =
  | 'SIN_PERMISO'
  | 'FUERA_DE_ENTIDAD'
  | 'FUERA_DE_TERRITORIO'
  | 'SIN_ASIGNACION'
  | 'CONSENTIMIENTO_REQUERIDO'
  | 'COMPARTIMENTO_AJENO'
  | 'MOTIVO_REQUERIDO'
  | 'LECTURA_MASIVA_PROHIBIDA';

export interface Decision {
  readonly allowed: boolean;
  readonly reason?: DenyReason;
  /** Campos que la consulta puede devolver. Se aplica EN la consulta. */
  readonly fieldMask?: readonly string[];
}

/** Recurso sobre el que se decide. Los campos ausentes no se comprueban. */
export interface Resource {
  readonly kind: string;
  readonly id?: string;
  readonly legalEntityId?: string | null;
  /** Ruta materializada de la unidad territorial del recurso. */
  readonly territorialPath?: string | null;
  readonly organizationId?: string | null;
  readonly compartment?: Compartment | null;
  /** Verdadero cuando la operación devolvería más de un registro. */
  readonly isBulk?: boolean;
  /** Verdadero cuando el recurso contiene datos personales. */
  readonly containsPersonalData?: boolean;
}

/** Comprobaciones que dependen del estado de la base, inyectadas por el llamador. */
export interface PolicyProbes {
  /** ¿Existe una asignación viva del actor sobre este recurso? */
  readonly hasLiveAssignment?: (actor: ActorContext, resource: Resource) => boolean;
  /** ¿Hay consentimiento vigente para el propósito de este permiso? */
  readonly hasValidConsent?: (actor: ActorContext, resource: Resource) => boolean;
  /** ¿El permiso exige consentimiento para este recurso? */
  readonly needsConsent?: (permissionCode: string, resource: Resource) => boolean;
}

const allow = (fieldMask?: readonly string[]): Decision =>
  fieldMask === undefined ? { allowed: true } : { allowed: true, fieldMask };

const deny = (reason: DenyReason): Decision => ({ allowed: false, reason });

/**
 * Permisos efectivos del actor, del MISMO origen que usa la decisión.
 *
 * La regla de no elevación —nadie otorga lo que no posee— necesita saber qué
 * posee el actor. Derivarlo aquí, de `resolveGrants`, evita que la regla se
 * calcule sobre una fuente distinta de la que decide: si un tipo de actor
 * obtiene permisos por una vía que esta función no mirara, la regla dejaría de
 * cubrirlo sin que nada lo advirtiera.
 */
export function effectiveGrantedPermissions(actor: ActorContext, now: Date = new Date()): ReadonlySet<string> {
  const all = new Set<string>();
  for (const grant of resolveGrants(actor, now)) {
    for (const code of grant.permissions) all.add(code);
  }
  return all;
}

/** Un nombramiento es efectivo solo dentro de su vigencia (PRD §4.3). */
export function isCurrentlyEffective(assignment: RoleAssignmentSnapshot, now: Date = new Date()): boolean {
  if (assignment.startsAt.getTime() > now.getTime()) return false;
  if (assignment.endsAt !== null && assignment.endsAt.getTime() <= now.getTime()) return false;
  return true;
}

interface Grant {
  readonly permissions: ReadonlySet<string>;
  readonly legalEntities: readonly string[] | 'ALL';
  readonly territories: readonly { path: string; includesDescendants: boolean }[] | 'ALL';
  readonly organizations: readonly string[] | 'ALL';
}

/**
 * Origen de los permisos. Es lo ÚNICO que depende del tipo de actor.
 */
function resolveGrants(actor: ActorContext, now: Date): Grant[] {
  switch (actor.actorKind) {
    case 'PERSON':
      return actor.roles.filter((assignment) => isCurrentlyEffective(assignment, now)).map((assignment) => ({
        permissions: assignment.permissions,
        legalEntities: assignment.legalEntityId === null ? ('ALL' as const) : [assignment.legalEntityId],
        territories:
          assignment.territories.length === 0
            ? ('ALL' as const)
            : assignment.territories.map((scope) => ({
                path: scope.path,
                includesDescendants: scope.includesDescendants,
              })),
        organizations: assignment.organizationId === null ? ('ALL' as const) : [assignment.organizationId],
      }));

    case 'ROOT_SUPERADMIN':
      // Lista CERRADA de concesión, no lista de prohibiciones.
      return [{ permissions: SUPERADMIN_GRANTED, legalEntities: 'ALL', territories: 'ALL', organizations: 'ALL' }];

    case 'SYSTEM':
      return [
        {
          permissions: JOB_GRANTS[actor.jobType ?? ''] ?? new Set<string>(),
          legalEntities: 'ALL',
          territories: 'ALL',
          organizations: 'ALL',
        },
      ];
  }
}

function matchesLegalEntity(grants: Grant[], resource: Resource): boolean {
  if (resource.legalEntityId === undefined || resource.legalEntityId === null) return true;
  return grants.some(
    (grant) => grant.legalEntities === 'ALL' || grant.legalEntities.includes(resource.legalEntityId as string),
  );
}

function matchesTerritory(grants: Grant[], resource: Resource): boolean {
  if (resource.territorialPath === undefined || resource.territorialPath === null) return true;
  const target = resource.territorialPath;
  return grants.some((grant) => {
    if (grant.territories === 'ALL') return true;
    return grant.territories.some((scope) =>
      scope.includesDescendants ? target === scope.path || target.startsWith(`${scope.path}/`) : target === scope.path,
    );
  });
}

function matchesOrganization(grants: Grant[], resource: Resource): boolean {
  if (resource.organizationId === undefined || resource.organizationId === null) return true;
  return grants.some(
    (grant) => grant.organizations === 'ALL' || grant.organizations.includes(resource.organizationId as string),
  );
}

/**
 * Decide si el actor puede ejecutar el permiso sobre el recurso.
 *
 * El orden de las comprobaciones es parte del contrato y no se altera.
 */
export function can(
  actor: ActorContext,
  permissionCode: string,
  resource: Resource,
  probes: PolicyProbes = {},
  now: Date = new Date(),
): Decision {
  const definition = permissionOrThrow(permissionCode);

  // 1. Origen de los permisos.
  const grants = resolveGrants(actor, now);
  if (!grants.some((grant) => grant.permissions.has(permissionCode))) return deny('SIN_PERMISO');

  // 2. Entidad jurídica.
  if (!matchesLegalEntity(grants, resource)) return deny('FUERA_DE_ENTIDAD');

  // 3. Territorio.
  if (!matchesTerritory(grants, resource)) return deny('FUERA_DE_TERRITORIO');
  if (!matchesOrganization(grants, resource)) return deny('FUERA_DE_ENTIDAD');

  // 4. Asignación viva sobre el expediente.
  if (definition.needsAssignment) {
    const hasAssignment = probes.hasLiveAssignment?.(actor, resource) ?? false;
    if (!hasAssignment) return deny('SIN_ASIGNACION');
  }

  // 5. Consentimiento vigente para el propósito.
  if (probes.needsConsent?.(permissionCode, resource) === true) {
    const consented = probes.hasValidConsent?.(actor, resource) ?? false;
    if (!consented) return deny('CONSENTIMIENTO_REQUERIDO');
  }

  // 6. Compartimento de sensibilidad.
  const compartment = resource.compartment ?? definition.compartment;
  if (compartment !== null && compartment !== undefined && !actor.compartments.has(compartment)) {
    return deny('COMPARTIMENTO_AJENO');
  }

  // 7. Motivo capturado por la persona.
  if (definition.requiresReason && (actor.reason === null || actor.reason.trim() === '')) {
    return deny('MOTIVO_REQUERIDO');
  }

  // Salvaguarda del actor raíz: sin lectura masiva de datos personales
  // (docs/PERMISSIONS.md §8). Se evalúa tras las siete comprobaciones para no
  // introducir una vía alterna de decisión.
  if (
    actor.actorKind === 'ROOT_SUPERADMIN' &&
    resource.isBulk === true &&
    resource.containsPersonalData === true
  ) {
    return deny('LECTURA_MASIVA_PROHIBIDA');
  }

  return allow(fieldMaskFor(actor, resource));
}

/**
 * Máscara de campos. El permiso de pantalla no basta: la proyección devuelta
 * omite lo no autorizado, de modo que ninguna respuesta lo contenga (PRD §19.1).
 */
export function fieldMaskFor(actor: ActorContext, resource: Resource): readonly string[] | undefined {
  if (resource.kind !== 'Person') return undefined;

  const canReadSensitive = actor.roles.some((assignment) =>
    assignment.permissions.has('identity.person.read_sensitive'),
  );
  if (canReadSensitive && actor.actorKind === 'PERSON') return undefined;

  // Proyección mínima: identifica a la persona sin exponer datos de contacto,
  // domicilio ni fecha de nacimiento.
  return [
    'id',
    'publicId',
    'givenName',
    'familyName',
    'secondFamilyName',
    'preferredName',
    'territorialUnitId',
    'createdAt',
  ];
}

/** Mensaje interno para la bitácora. Nunca se muestra a la persona. */
export function explain(reason: DenyReason): string {
  switch (reason) {
    case 'SIN_PERMISO':
      return 'el actor no tiene el permiso en ninguna concesión vigente';
    case 'FUERA_DE_ENTIDAD':
      return 'el recurso pertenece a otra entidad jurídica u organización';
    case 'FUERA_DE_TERRITORIO':
      return 'el recurso está fuera del alcance territorial del nombramiento';
    case 'SIN_ASIGNACION':
      return 'el permiso exige una asignación viva sobre el expediente';
    case 'CONSENTIMIENTO_REQUERIDO':
      return 'no hay consentimiento vigente para este propósito';
    case 'COMPARTIMENTO_AJENO':
      return 'el recurso pertenece a un compartimento que el actor no tiene';
    case 'MOTIVO_REQUERIDO':
      return 'el permiso exige un motivo escrito por la persona';
    case 'LECTURA_MASIVA_PROHIBIDA':
      return 'el actor raíz no puede leer datos personales de forma masiva';
  }
}
