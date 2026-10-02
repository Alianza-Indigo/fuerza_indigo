import { publicDelegations } from '@/modules/governance';
import { publicHonoraryDirectory } from '@/modules/membership';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { errors } from '@/platform/errors/app-error';
import { fail, ok } from '@/platform/kernel/result';
import { isMapCategory, mapLocationSchema, safeWebsite, type NetworkMapEntry } from '../domain/map';

function text(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
const blank = { latitude: null, longitude: null, address: null, city: null, state: null, contactName: null, phone: null };

// Only public projections enter this service. Never read private personal contacts.
async function eligibleEntries(): Promise<NetworkMapEntry[]> {
  const [delegations, honorary] = await Promise.all([publicDelegations(), publicHonoraryDirectory()]);
  return [
    ...delegations.map((entry): NetworkMapEntry => ({
      ...blank, id: `delegation:${entry.publicId}`, name: entry.name,
      category: isMapCategory(entry.type) ? entry.type : null,
      territory: entry.parentName, description: entry.parentName === null ? null : `Forma parte de ${entry.parentName}`,
      email: entry.contactEmail, website: null, profileHref: '/delegaciones#directorio',
    })),
    ...honorary.map((entry): NetworkMapEntry => ({
      ...blank, id: `honorary:${entry.slug}`, name: text(entry.fields, 'nombre') ?? 'Agremiado honorario', category: 'HONORARY',
      territory: text(entry.fields, 'territorio'), description: text(entry.fields, 'titular'),
      email: text(entry.fields, 'correoProfesional'), phone: text(entry.fields, 'telefonoProfesional'),
      website: safeWebsite(entry.fields['sitioWeb']), profileHref: entry.profileHref,
    })),
  ];
}

export interface ManagedMapEntry { entry: NetworkMapEntry; enabled: boolean }
async function locations(management: boolean): Promise<ManagedMapEntry[]> {
  const sources = await eligibleEntries();
  const saved = await db().networkMapLocation.findMany({ where: { subjectKey: { in: sources.map((entry) => entry.id) } } });
  const byKey = new Map(saved.map((row) => [row.subjectKey, row]));
  return sources.map((entry) => {
    const row = byKey.get(entry.id);
    if (row === undefined || (!management && !row.enabled)) return { entry, enabled: false };
    return {
      enabled: row.enabled,
      entry: {
        ...entry, category: entry.category ?? (isMapCategory(row.category) ? row.category : null),
        latitude: row.latitude, longitude: row.longitude, address: row.address, city: row.city, state: row.state,
        contactName: row.contactName, email: row.email ?? entry.email, phone: row.phone ?? entry.phone,
        website: safeWebsite(row.website) ?? entry.website,
      },
    };
  });
}
export async function publicNetworkMap(): Promise<NetworkMapEntry[]> {
  return (await locations(false)).map(({ entry }) => entry);
}
export async function manageNetworkMap(actor: ActorContext) {
  if (actor.actorKind !== 'ROOT_SUPERADMIN') return fail(errors.forbidden('Solo el Superadmin administra el mapa público.'));
  return ok(await locations(true));
}
export async function saveMapLocation(actor: ActorContext, input: unknown) {
  if (actor.actorKind !== 'ROOT_SUPERADMIN') return fail(errors.forbidden('Solo el Superadmin administra el mapa público.'));
  const parsed = mapLocationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), [issue.message]]))));
  const data = parsed.data;
  const source = (await eligibleEntries()).find((entry) => entry.id === data.subjectKey);
  if (source === undefined) return fail(errors.conflict('La delegación o el honorario ya no está disponible en el directorio público.'));
  if ((source.category !== null && data.category !== source.category) || (source.category === null && data.category === 'HONORARY')) {
    return fail(errors.validation({ category: ['El tipo no corresponde a este registro.'] }));
  }
  await transaction(async (tx) => {
    const record = { ...data, updatedByActorId: actor.actorId };
    await tx.networkMapLocation.upsert({ where: { subjectKey: data.subjectKey }, create: record, update: record });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.SUPERADMIN_ACTION, objectKind: 'NetworkMapLocation', objectId: data.subjectKey, outcome: 'SUCCESS',
      metadata: { operation: 'network-map-location-saved', enabled: data.enabled, category: data.category },
    });
  });
  return ok({ saved: true });
}
