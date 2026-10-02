import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filterMapEntries, hasCoordinates, mapLocationSchema, safeWebsite, type NetworkMapEntry } from '@/modules/network-map/public';
import { publicNetworkMap, saveMapLocation } from '@/modules/network-map';
import type { ActorContext } from '@/platform/kernel/actor-context';

const mocks = vi.hoisted(() => ({ delegations: vi.fn(), honorary: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), audit: vi.fn() }));
vi.mock('@/modules/governance', () => ({ publicDelegations: mocks.delegations }));
vi.mock('@/modules/membership', () => ({ publicHonoraryDirectory: mocks.honorary }));
vi.mock('@/platform/db/client', () => ({ db: () => ({ networkMapLocation: { findMany: mocks.findMany } }) }));
vi.mock('@/platform/db/unit-of-work', () => ({ transaction: (work: (tx: unknown) => Promise<unknown>) => work({ networkMapLocation: { upsert: mocks.upsert } }) }));
vi.mock('@/platform/audit/audit-service', () => ({ recordAudit: mocks.audit }));

const entry: NetworkMapEntry = {
  id: 'delegation:prueba', name: 'Delegación Chihuahua', category: 'STATE', territory: 'Chihuahua', description: null,
  latitude: 28.63, longitude: -106.07, address: null, city: 'Chihuahua', state: 'Chihuahua', contactName: null,
  email: 'publico@example.org', phone: null, website: null, profileHref: null,
};
const input = { subjectKey: entry.id, category: 'STATE', enabled: true, latitude: entry.latitude, longitude: entry.longitude, address: null, city: entry.city, state: entry.state, contactName: null, email: entry.email, phone: null, website: null };
const actor = { actorKind: 'ROOT_SUPERADMIN', actorId: '00000000-0000-4000-8000-000000000001' } as ActorContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.delegations.mockResolvedValue([{ publicId: 'prueba', name: entry.name, type: 'STATE', contactEmail: entry.email, parentName: 'México' }]);
  mocks.honorary.mockResolvedValue([]);
  mocks.findMany.mockResolvedValue([{ ...input }]);
});

describe('Publicación del mapa nacional', () => {
  it('usa la ubicación exacta registrada y el contacto público', async () => {
    const [point] = await publicNetworkMap();
    expect(point).toMatchObject({ id: entry.id, category: 'STATE', latitude: 28.63, longitude: -106.07, email: entry.email });
  });
  it('no publica una ubicación guardada si la fuente deja de ser pública', async () => {
    mocks.delegations.mockResolvedValue([]);
    expect(await publicNetworkMap()).toEqual([]);
  });
  it('retira coordenadas y contactos adicionales al desactivar el punto', async () => {
    mocks.findMany.mockResolvedValue([{ ...input, enabled: false, email: 'adicional@example.org' }]);
    expect((await publicNetworkMap())[0]).toMatchObject({ latitude: null, longitude: null, email: entry.email });
  });
  it('mantiene en la lista registros sin coordenadas, sin inventar una ubicación', async () => {
    mocks.findMany.mockResolvedValue([]);
    const [point] = await publicNetworkMap();
    expect(point?.latitude).toBeNull();
    expect(point?.longitude).toBeNull();
  });
  it('incluye honorarios personas y organizaciones desde sus fichas autorizadas', async () => {
    mocks.delegations.mockResolvedValue([]);
    mocks.findMany.mockResolvedValue([]);
    mocks.honorary.mockResolvedValue([
      { slug: 'persona', subjectKind: 'PERSON', fields: { nombre: 'Profesional de prueba', correoProfesional: 'profesional@example.org' }, profileHref: '/directorio/persona' },
      { slug: 'organizacion-1', subjectKind: 'ORGANIZATION', fields: { nombre: 'Organización de prueba', sitioWeb: 'https://example.org' }, profileHref: null },
    ]);
    const points = await publicNetworkMap();
    expect(points.map((point) => point.category)).toEqual(['HONORARY', 'HONORARY']);
    expect(points[0]?.email).toBe('profesional@example.org');
    expect(points[1]?.website).toBe('https://example.org/');
  });
  it('rechaza escrituras sin autoridad incluso si el formulario fue manipulado', async () => {
    expect((await saveMapLocation({ ...actor, actorKind: 'PERSON' }, input)).ok).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rechaza un sujeto ya retirado o una categoría incompatible', async () => {
    expect((await saveMapLocation(actor, { ...input, category: 'HONORARY' })).ok).toBe(false);
    mocks.delegations.mockResolvedValue([]);
    expect((await saveMapLocation(actor, input)).ok).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('guarda con autoría y audita la publicación', async () => {
    expect((await saveMapLocation(actor, input)).ok).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { subjectKey: entry.id }, create: expect.objectContaining({ updatedByActorId: actor.actorId }) }));
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
});

describe('Búsqueda y captura', () => {
  it('combina categoría, estado y búsqueda sin acentos por ciudad o nombre', () => {
    const honorary = { ...entry, id: 'honorary:otra', category: 'HONORARY' as const, name: 'Terapia', city: 'Mérida', state: 'Yucatán' };
    expect(filterMapEntries([entry, honorary], 'HONORARY', 'Yucatán', 'merida')).toEqual([honorary]);
    expect(filterMapEntries([entry, honorary], 'STATE', '', 'delegacion')).toEqual([entry]);
    expect(filterMapEntries([entry], 'HONORARY', '', '')).toEqual([]);
  });
  it('no acepta medias coordenadas, infinitos ni publicaciones sin ubicación', () => {
    for (const values of [{ latitude: null }, { longitude: null }, { latitude: 91 }, { longitude: Infinity }, { latitude: null, longitude: null }]) {
      expect(mapLocationSchema.safeParse({ ...input, ...values }).success).toBe(false);
    }
    expect(hasCoordinates({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(mapLocationSchema.safeParse({ ...input, latitude: 0, longitude: 0 }).success).toBe(true);
  });
  it('no permite enlaces ejecutables en las fichas', () => {
    expect(safeWebsite('javascript:alert(1)')).toBeNull();
    expect(mapLocationSchema.safeParse({ ...input, website: 'javascript:alert(1)' }).success).toBe(false);
    expect(safeWebsite('https://example.org')).toBe('https://example.org/');
  });
});
