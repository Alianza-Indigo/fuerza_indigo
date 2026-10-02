import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  myHonoraryMapLocations,
  publicNetworkMap,
  reviewMapLocationRequest,
  submitOwnMapLocationRequest,
} from '@/modules/network-map';
import type { ActorContext } from '@/platform/kernel/actor-context';

const mocks = vi.hoisted(() => ({
  honorary: vi.fn(),
  memberships: vi.fn(),
  publication: vi.fn(),
  locationFindMany: vi.fn(),
  requestFindMany: vi.fn(),
  requestFindUnique: vi.fn(),
  requestUpdateMany: vi.fn(),
  requestCreate: vi.fn(),
  locationUpsert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/modules/governance', () => ({ publicDelegations: vi.fn().mockResolvedValue([]) }));
vi.mock('@/modules/membership', () => ({ publicHonoraryDirectory: mocks.honorary }));
vi.mock('@/platform/db/client', () => ({
  db: () => ({
    membership: { findMany: mocks.memberships },
    directoryPublication: { findFirst: mocks.publication },
    networkMapLocation: { findMany: mocks.locationFindMany },
    networkMapRequest: { findMany: mocks.requestFindMany, findUnique: mocks.requestFindUnique },
  }),
}));
vi.mock('@/platform/db/unit-of-work', () => ({
  transaction: (work: (tx: unknown) => Promise<unknown>) => work({
    networkMapRequest: {
      updateMany: mocks.requestUpdateMany,
      create: mocks.requestCreate,
    },
    networkMapLocation: { upsert: mocks.locationUpsert },
  }),
}));
vi.mock('@/platform/audit/audit-service', () => ({ recordAudit: mocks.audit }));

const actor = {
  actorKind: 'PERSON',
  actorId: '00000000-0000-4000-8000-000000000001',
  personId: '00000000-0000-4000-8000-000000000010',
} as ActorContext;
const root = {
  ...actor,
  actorKind: 'ROOT_SUPERADMIN',
  actorId: '00000000-0000-4000-8000-000000000002',
  personId: null,
} as ActorContext;
const entry = {
  slug: 'persona-honoraria',
  subjectKind: 'PERSON' as const,
  fields: { nombre: 'Persona honoraria', correoProfesional: 'publico@example.org' },
  indexable: false,
  publishedAt: new Date('2026-10-01T00:00:00Z'),
  profileHref: '/directorio/persona-honoraria',
};
const requestInput = {
  subjectKey: 'honorary:persona-honoraria',
  latitude: 28.632,
  longitude: -106.069,
  address: 'Centro, Chihuahua',
  city: 'Chihuahua',
  state: 'Chihuahua',
  contactName: 'Atención profesional',
  email: 'mapa@example.org',
  phone: '+52 614 000 0000',
  website: 'https://example.org',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.honorary.mockResolvedValue([entry]);
  mocks.memberships.mockResolvedValue([{ organization: null }]);
  mocks.publication.mockResolvedValue({ slug: entry.slug });
  mocks.locationFindMany.mockResolvedValue([]);
  mocks.requestFindMany.mockResolvedValue([]);
  mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
  mocks.requestCreate.mockResolvedValue({ id: 'request-1' });
  mocks.locationUpsert.mockResolvedValue({ subjectKey: requestInput.subjectKey });
  mocks.audit.mockResolvedValue(undefined);
});

describe('Solicitud propia de ubicación honoraria', () => {
  it('ofrece únicamente la ficha honoraria pública que pertenece a la persona', async () => {
    const result = await myHonoraryMapLocations(actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries).toHaveLength(1);
    expect(result.data.entries[0]?.entry.id).toBe(requestInput.subjectKey);
    expect(result.data.entries[0]?.latestRequest).toBeNull();
  });

  it('registra una solicitud pendiente sin publicar ni reemplazar la ubicación vigente', async () => {
    const result = await submitOwnMapLocationRequest(actor, requestInput);
    expect(result.ok).toBe(true);
    expect(mocks.requestCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subjectKey: requestInput.subjectKey,
        status: 'PENDING',
        requestedByActorId: actor.actorId,
      }),
      select: { id: true },
    });
    expect(mocks.locationUpsert).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it('no muestra una solicitud pendiente en el mapa público', async () => {
    mocks.requestFindMany.mockResolvedValue([{ id: 'pending-only', ...requestInput, status: 'PENDING' }]);
    const [publicEntry] = await publicNetworkMap();
    expect(publicEntry?.latitude).toBeNull();
    expect(publicEntry?.longitude).toBeNull();
    expect(mocks.requestFindMany).not.toHaveBeenCalled();
  });

  it('rechaza que el honorario solicite para una ficha que no le pertenece', async () => {
    const result = await submitOwnMapLocationRequest(actor, {
      ...requestInput,
      subjectKey: 'honorary:otra-persona',
    });
    expect(result.ok).toBe(false);
    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it('incluye a la organización honoraria representada por la misma cuenta', async () => {
    mocks.memberships.mockResolvedValue([{ organization: { publicId: 'org-publica' } }]);
    mocks.publication.mockResolvedValue(null);
    mocks.honorary.mockResolvedValue([{ ...entry, slug: 'organizacion-org-publica', subjectKind: 'ORGANIZATION' }]);
    const result = await myHonoraryMapLocations(actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries[0]?.entry.id).toBe('honorary:organizacion-org-publica');
  });
});

describe('Autorización de ubicaciones honorarias', () => {
  const pending = {
    id: '00000000-0000-4000-8000-000000000099',
    ...requestInput,
    category: 'HONORARY',
    status: 'PENDING',
    requestedAt: new Date('2026-10-02T00:00:00Z'),
    requestedByActorId: actor.actorId,
    reviewedAt: null,
    reviewedByActorId: null,
    reviewNote: null,
  };

  beforeEach(() => mocks.requestFindUnique.mockResolvedValue(pending));

  it('solo permite decidir al Superadmin', async () => {
    const result = await reviewMapLocationRequest(actor, { requestId: pending.id, decision: 'APPROVE', note: null });
    expect(result.ok).toBe(false);
    expect(mocks.locationUpsert).not.toHaveBeenCalled();
  });

  it('al aprobar copia la propuesta a la ubicación pública y la habilita', async () => {
    const result = await reviewMapLocationRequest(root, { requestId: pending.id, decision: 'APPROVE', note: null });
    expect(result.ok).toBe(true);
    expect(mocks.locationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { subjectKey: requestInput.subjectKey },
      create: expect.objectContaining({ enabled: true, latitude: requestInput.latitude, updatedByActorId: root.actorId }),
      update: expect.objectContaining({ enabled: true, longitude: requestInput.longitude, updatedByActorId: root.actorId }),
    }));
    expect(mocks.requestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: pending.id, status: 'PENDING' },
      data: expect.objectContaining({ status: 'APPROVED', reviewedByActorId: root.actorId }),
    }));
  });

  it('al rechazar conserva intacta cualquier ubicación publicada', async () => {
    const result = await reviewMapLocationRequest(root, { requestId: pending.id, decision: 'REJECT', note: 'La sede no coincide.' });
    expect(result.ok).toBe(true);
    expect(mocks.locationUpsert).not.toHaveBeenCalled();
    expect(mocks.requestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'REJECTED', reviewNote: 'La sede no coincide.' }),
    }));
  });

  it('exige una observación para rechazar', async () => {
    const result = await reviewMapLocationRequest(root, { requestId: pending.id, decision: 'REJECT', note: null });
    expect(result.ok).toBe(false);
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled();
  });
});
