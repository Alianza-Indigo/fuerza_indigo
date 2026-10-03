import { publicDelegations } from '@/modules/governance';
import { publicHonoraryDirectory, type PublicHonoraryEntry } from '@/modules/membership';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { errors } from '@/platform/errors/app-error';
import { fail, ok } from '@/platform/kernel/result';
import {
  isMapCategory,
  mapLocationReviewSchema,
  mapLocationSchema,
  ownMapLocationRequestSchema,
  safeWebsite,
  type NetworkMapEntry,
} from '../domain/map';

function text(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

const blank = {
  latitude: null,
  longitude: null,
  address: null,
  city: null,
  state: null,
  contactName: null,
  phone: null,
};

function honoraryMapEntry(entry: PublicHonoraryEntry): NetworkMapEntry {
  return {
    ...blank,
    id: `honorary:${entry.slug}`,
    name: text(entry.fields, 'nombre') ?? 'Agremiado honorario',
    category: 'HONORARY',
    territory: text(entry.fields, 'territorio'),
    description: text(entry.fields, 'titular'),
    email: text(entry.fields, 'correoProfesional'),
    phone: text(entry.fields, 'telefonoProfesional'),
    website: safeWebsite(entry.fields['sitioWeb']),
    profileHref: entry.profileHref,
  };
}

// Only public projections enter this service. Never read private personal contacts.
async function eligibleEntries(): Promise<NetworkMapEntry[]> {
  const [delegations, honorary] = await Promise.all([publicDelegations(), publicHonoraryDirectory()]);
  return [
    ...delegations.map((entry): NetworkMapEntry => ({
      ...blank,
      id: `delegation:${entry.publicId}`,
      name: entry.name,
      category:
        entry.type === 'DELEGATION'
          ? entry.municipalityCode === null ? 'STATE' : 'MUNICIPALITY'
          : isMapCategory(entry.type) ? entry.type : null,
      territory: entry.parentName,
      description: entry.parentName === null ? null : `Forma parte de ${entry.parentName}`,
      email: entry.contactEmail,
      website: null,
      profileHref: '/delegaciones#directorio',
    })),
    ...honorary.map(honoraryMapEntry),
  ];
}

export interface MapLocationRequestView {
  readonly id: string;
  readonly subjectKey: string;
  readonly status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly contactName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly requestedAt: string;
  readonly reviewNote: string | null;
}

function requestView(row: {
  id: string;
  subjectKey: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  state: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  requestedAt: Date;
  reviewNote: string | null;
}): MapLocationRequestView {
  return { ...row, requestedAt: row.requestedAt.toISOString() };
}

function withSavedLocation(entry: NetworkMapEntry, row: {
  category: string;
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
} | undefined, management: boolean): { entry: NetworkMapEntry; enabled: boolean } {
  if (row === undefined || (!management && !row.enabled)) return { entry, enabled: false };
  return {
    enabled: row.enabled,
    entry: {
      ...entry,
      category: entry.category ?? (isMapCategory(row.category) ? row.category : null),
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      city: row.city,
      state: row.state,
      contactName: row.contactName,
      email: row.email ?? entry.email,
      phone: row.phone ?? entry.phone,
      website: safeWebsite(row.website) ?? entry.website,
    },
  };
}

export interface ManagedMapEntry {
  readonly entry: NetworkMapEntry;
  readonly enabled: boolean;
  readonly pendingRequest: MapLocationRequestView | null;
}

async function locations(management: boolean): Promise<ManagedMapEntry[]> {
  const sources = await eligibleEntries();
  const subjectKeys = sources.map((entry) => entry.id);
  const [saved, pending] = await Promise.all([
    db().networkMapLocation.findMany({ where: { subjectKey: { in: subjectKeys } } }),
    management
      ? db().networkMapRequest.findMany({
          where: { subjectKey: { in: subjectKeys }, status: 'PENDING' },
          orderBy: { requestedAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);
  const byKey = new Map(saved.map((row) => [row.subjectKey, row]));
  const pendingByKey = new Map<string, MapLocationRequestView>();
  for (const row of pending) {
    if (!pendingByKey.has(row.subjectKey)) pendingByKey.set(row.subjectKey, requestView(row));
  }
  return sources.map((source) => ({
    ...withSavedLocation(source, byKey.get(source.id), management),
    pendingRequest: pendingByKey.get(source.id) ?? null,
  }));
}

export async function publicNetworkMap(): Promise<NetworkMapEntry[]> {
  return (await locations(false)).map(({ entry }) => entry);
}

export async function manageNetworkMap(actor: ActorContext) {
  if (actor.actorKind !== 'ROOT_SUPERADMIN') {
    return fail(errors.forbidden('Solo el Superadmin administra el mapa público.'));
  }
  return ok(await locations(true));
}

async function ownHonorarySources(actor: ActorContext) {
  if (actor.actorKind !== 'PERSON' || actor.personId === null || actor.actorId === '') {
    return fail(errors.forbidden('Necesitas entrar con la cuenta titular de la membresía honoraria.'));
  }
  const now = new Date();
  const [memberships, publication, honorary] = await Promise.all([
    db().membership.findMany({
      where: {
        personId: actor.personId,
        category: 'HONORARY_AFFILIATE',
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { organization: { select: { publicId: true } } },
    }),
    db().directoryPublication.findFirst({
      where: { personId: actor.personId, withdrawnAt: null },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true },
    }),
    publicHonoraryDirectory(),
  ]);

  const hasPersonalMembership = memberships.some((membership) => membership.organization === null);
  const ownSlugs = new Set<string>();
  if (hasPersonalMembership && publication !== null) ownSlugs.add(publication.slug);
  for (const membership of memberships) {
    if (membership.organization !== null) ownSlugs.add(`organizacion-${membership.organization.publicId}`);
  }

  return ok({
    sources: honorary.filter((entry) => ownSlugs.has(entry.slug)).map(honoraryMapEntry),
    requiresPublicProfile: hasPersonalMembership && publication === null,
    hasHonoraryMembership: memberships.length > 0,
  });
}

export interface OwnHonoraryMapEntry {
  readonly entry: NetworkMapEntry;
  readonly enabled: boolean;
  readonly latestRequest: MapLocationRequestView | null;
}

export async function myHonoraryMapLocations(actor: ActorContext) {
  const own = await ownHonorarySources(actor);
  if (!own.ok) return own;
  const subjectKeys = own.data.sources.map((entry) => entry.id);
  const [saved, requests] = subjectKeys.length === 0
    ? [[], []] as const
    : await Promise.all([
        db().networkMapLocation.findMany({ where: { subjectKey: { in: subjectKeys } } }),
        db().networkMapRequest.findMany({
          where: { subjectKey: { in: subjectKeys } },
          orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        }),
      ]);
  const byKey = new Map(saved.map((row) => [row.subjectKey, row]));
  const latestByKey = new Map<string, MapLocationRequestView>();
  for (const row of requests) {
    if (!latestByKey.has(row.subjectKey)) latestByKey.set(row.subjectKey, requestView(row));
  }
  const entries: OwnHonoraryMapEntry[] = own.data.sources.map((source) => ({
    ...withSavedLocation(source, byKey.get(source.id), true),
    latestRequest: latestByKey.get(source.id) ?? null,
  }));
  return ok({
    entries,
    requiresPublicProfile: own.data.requiresPublicProfile,
    hasHonoraryMembership: own.data.hasHonoraryMembership,
  });
}

export async function submitOwnMapLocationRequest(actor: ActorContext, input: unknown) {
  const parsed = ownMapLocationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(errors.validation(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), [issue.message]]))));
  }
  const own = await ownHonorarySources(actor);
  if (!own.ok) return own;
  if (!own.data.sources.some((source) => source.id === parsed.data.subjectKey)) {
    return fail(errors.forbidden('Solo puedes solicitar la ubicación de tu propia membresía honoraria publicada.'));
  }

  const created = await transaction(async (tx) => {
    await tx.networkMapRequest.updateMany({
      where: { subjectKey: parsed.data.subjectKey, status: 'PENDING' },
      data: { status: 'SUPERSEDED' },
    });
    const request = await tx.networkMapRequest.create({
      data: {
        ...parsed.data,
        category: 'HONORARY',
        status: 'PENDING',
        requestedByActorId: actor.actorId,
      },
      select: { id: true },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.NETWORK_MAP_LOCATION_REQUESTED,
      objectKind: 'NetworkMapRequest',
      objectId: request.id,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: actor.personId,
      metadata: { subjectKey: parsed.data.subjectKey },
    });
    return request;
  });
  return ok({ requestId: created.id, status: 'PENDING' as const });
}

export async function reviewMapLocationRequest(actor: ActorContext, input: unknown) {
  if (actor.actorKind !== 'ROOT_SUPERADMIN') {
    return fail(errors.forbidden('Solo el Superadmin autoriza ubicaciones para el mapa público.'));
  }
  const parsed = mapLocationReviewSchema.safeParse(input);
  if (!parsed.success) {
    return fail(errors.validation(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), [issue.message]]))));
  }
  const request = await db().networkMapRequest.findUnique({ where: { id: parsed.data.requestId } });
  if (request === null || request.status !== 'PENDING') {
    return fail(errors.conflict('La solicitud ya fue resuelta o dejó de estar disponible.'));
  }
  const source = (await eligibleEntries()).find((entry) => entry.id === request.subjectKey && entry.category === 'HONORARY');
  if (source === undefined) {
    return fail(errors.conflict('La membresía honoraria o su autorización pública ya no están vigentes.'));
  }

  const reviewedAt = new Date();
  const approved = parsed.data.decision === 'APPROVE';
  const completed = await transaction(async (tx) => {
    const claimed = await tx.networkMapRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedAt,
        reviewedByActorId: actor.actorId,
        reviewNote: parsed.data.note,
      },
    });
    if (claimed.count !== 1) return false;

    if (approved) {
      const location = {
        subjectKey: request.subjectKey,
        category: 'HONORARY',
        enabled: true,
        latitude: request.latitude,
        longitude: request.longitude,
        address: request.address,
        city: request.city,
        state: request.state,
        contactName: request.contactName,
        email: request.email,
        phone: request.phone,
        website: request.website,
        updatedByActorId: actor.actorId,
      };
      await tx.networkMapLocation.upsert({
        where: { subjectKey: request.subjectKey },
        create: location,
        update: location,
      });
    }

    await recordAudit(tx, actor, {
      action: approved
        ? AUDIT_ACTIONS.NETWORK_MAP_LOCATION_APPROVED
        : AUDIT_ACTIONS.NETWORK_MAP_LOCATION_REJECTED,
      objectKind: 'NetworkMapRequest',
      objectId: request.id,
      outcome: 'SUCCESS',
      metadata: { subjectKey: request.subjectKey, decision: parsed.data.decision },
    });
    return true;
  });
  if (!completed) return fail(errors.conflict('La solicitud fue resuelta por otra sesión.'));
  return ok({ status: approved ? 'APPROVED' as const : 'REJECTED' as const });
}

export async function saveMapLocation(actor: ActorContext, input: unknown) {
  if (actor.actorKind !== 'ROOT_SUPERADMIN') {
    return fail(errors.forbidden('Solo el Superadmin administra el mapa público.'));
  }
  const parsed = mapLocationSchema.safeParse(input);
  if (!parsed.success) {
    return fail(errors.validation(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), [issue.message]]))));
  }
  const data = parsed.data;
  const source = (await eligibleEntries()).find((entry) => entry.id === data.subjectKey);
  if (source === undefined) {
    return fail(errors.conflict('La delegación o el honorario ya no está disponible en el directorio público.'));
  }
  if ((source.category !== null && data.category !== source.category) || (source.category === null && data.category === 'HONORARY')) {
    return fail(errors.validation({ category: ['El tipo no corresponde a este registro.'] }));
  }
  await transaction(async (tx) => {
    const record = { ...data, updatedByActorId: actor.actorId };
    await tx.networkMapLocation.upsert({ where: { subjectKey: data.subjectKey }, create: record, update: record });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.SUPERADMIN_ACTION,
      objectKind: 'NetworkMapLocation',
      objectId: data.subjectKey,
      outcome: 'SUCCESS',
      metadata: { operation: 'network-map-location-saved', enabled: data.enabled, category: data.category },
    });
  });
  return ok({ saved: true });
}
