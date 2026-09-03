import type { Compartment, RoleCode } from '@prisma-client/enums';

/**
 * Contexto del actor que ejecuta un caso de uso (docs/ARCHITECTURE.md §6).
 *
 * Se construye una sola vez por petición y viaja hasta la persistencia. El tipo
 * de actor determina **de dónde salen sus permisos**, nunca cuántas
 * verificaciones atraviesa (docs/PERMISSIONS.md §5.1).
 */
export type ActorKindRuntime = 'PERSON' | 'ROOT_SUPERADMIN' | 'SYSTEM';

/** Instantánea de un nombramiento vigente. */
export interface RoleAssignmentSnapshot {
  readonly assignmentId: string;
  readonly role: RoleCode;
  readonly permissions: ReadonlySet<string>;
  readonly legalEntityId: string | null;
  readonly organizationId: string | null;
  /** Rutas materializadas del territorio alcanzado, con o sin descendientes. */
  readonly territories: readonly TerritorialScopeSnapshot[];
  readonly startsAt: Date;
  readonly endsAt: Date | null;
}

export interface TerritorialScopeSnapshot {
  readonly territorialUnitId: string;
  readonly path: string;
  readonly includesDescendants: boolean;
}

export interface ActorContext {
  /** Siempre presente: referencia a `Actor` (ADR-0026). */
  readonly actorId: string;
  readonly actorKind: ActorKindRuntime;
  /** Solo cuando `actorKind === 'PERSON'`. */
  readonly userId: string | null;
  readonly personId: string | null;
  /** Solo cuando `actorKind === 'SYSTEM'`. */
  readonly jobType: string | null;
  readonly sessionId: string | null;

  readonly roles: readonly RoleAssignmentSnapshot[];
  readonly legalEntityScope: readonly string[];
  /** Vacío para el Superadmin raíz: es la salvaguarda de docs/PERMISSIONS.md §5.1. */
  readonly compartments: ReadonlySet<Compartment>;

  /** Motivo capturado por la persona. Exigido por los permisos que lo marcan. */
  readonly reason: string | null;

  readonly correlationId: string;
  readonly ipHash: string | null;
  readonly userAgentSummary: string | null;
  readonly locale: string;
  readonly timeZone: string;
}

/** Contexto del actor público, sin sesión. */
export function publicContext(correlationId: string): ActorContext {
  return {
    actorId: '',
    actorKind: 'PERSON',
    userId: null,
    personId: null,
    jobType: null,
    sessionId: null,
    roles: [],
    legalEntityScope: [],
    compartments: new Set(),
    reason: null,
    correlationId,
    ipHash: null,
    userAgentSummary: null,
    locale: 'es-MX',
    timeZone: 'America/Mexico_City',
  };
}

/** Contexto de un trabajo programado. Sus permisos los declara su tipo. */
export function systemContext(input: {
  actorId: string;
  jobType: string;
  correlationId: string;
}): ActorContext {
  return {
    actorId: input.actorId,
    actorKind: 'SYSTEM',
    userId: null,
    personId: null,
    jobType: input.jobType,
    sessionId: null,
    roles: [],
    legalEntityScope: [],
    compartments: new Set(),
    reason: `trabajo programado: ${input.jobType}`,
    correlationId: input.correlationId,
    ipHash: null,
    userAgentSummary: null,
    locale: 'es-MX',
    timeZone: 'America/Mexico_City',
  };
}

export function withReason(context: ActorContext, reason: string): ActorContext {
  return { ...context, reason };
}

export function isAuthenticated(context: ActorContext): boolean {
  return context.actorId !== '' && (context.userId !== null || context.actorKind === 'ROOT_SUPERADMIN');
}
