import type { Compartment, RoleCode } from '@prisma-client/enums';
import type { ActorContext, RoleAssignmentSnapshot } from '@/platform/kernel/actor-context';

/**
 * Constructores de contextos de actor para las pruebas.
 *
 * Se construyen a mano, sin pasar por la base, porque lo que se prueba aquí es
 * el motor de decisión: mezclarlo con la consulta que arma el contexto haría
 * que un fallo de cualquiera de los dos se atribuyera al otro. La resolución
 * real desde la base se prueba aparte, en las pruebas de integración.
 */

const HORA = 60 * 60 * 1000;

export function assignment(overrides: Partial<RoleAssignmentSnapshot> = {}): RoleAssignmentSnapshot {
  return {
    assignmentId: 'asignacion-1',
    role: 'ADMIN_NACIONAL' as RoleCode,
    permissions: new Set<string>(),
    legalEntityId: null,
    organizationId: null,
    territories: [],
    startsAt: new Date(Date.now() - HORA),
    endsAt: null,
    ...overrides,
  };
}

export function person(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    actorId: 'actor-persona',
    actorKind: 'PERSON',
    userId: 'usuario-1',
    personId: 'persona-1',
    jobType: null,
    sessionId: 'sesion-1',
    roles: [],
    legalEntityScope: [],
    compartments: new Set<Compartment>(),
    reason: null,
    correlationId: 'correlacion-de-prueba',
    ipHash: null,
    userAgentSummary: null,
    locale: 'es-MX',
    timeZone: 'America/Mexico_City',
    ...overrides,
  };
}

/** Persona con los permisos indicados, sin acotación territorial ni de entidad. */
export function personWith(permissions: string[], overrides: Partial<ActorContext> = {}): ActorContext {
  return person({ roles: [assignment({ permissions: new Set(permissions) })], ...overrides });
}

export function root(overrides: Partial<ActorContext> = {}): ActorContext {
  return person({
    actorId: 'actor-raiz',
    actorKind: 'ROOT_SUPERADMIN',
    userId: null,
    personId: null,
    sessionId: 'sesion-raiz',
    // Vacío a propósito: es la salvaguarda de docs/PERMISSIONS.md §5.1.
    compartments: new Set<Compartment>(),
    ...overrides,
  });
}

export function job(jobType: string, overrides: Partial<ActorContext> = {}): ActorContext {
  return person({
    actorId: `actor-trabajo-${jobType}`,
    actorKind: 'SYSTEM',
    userId: null,
    personId: null,
    jobType,
    sessionId: null,
    reason: `trabajo programado: ${jobType}`,
    ...overrides,
  });
}
