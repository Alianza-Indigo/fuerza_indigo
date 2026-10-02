import { z } from 'zod';

export const MAP_CATEGORIES = {
  STATE: 'Delegaciones estatales',
  MUNICIPALITY: 'Delegaciones municipales',
  SECTION: 'Delegaciones seccionales',
  HONORARY: 'Agremiados honorarios',
} as const;
export type MapCategory = keyof typeof MAP_CATEGORIES;
export const MAP_COLORS: Record<MapCategory, string> = {
  STATE: '#a21caf', MUNICIPALITY: '#6d28d9', SECTION: '#087e98', HONORARY: '#b45309',
};
export function isMapCategory(value: unknown): value is MapCategory {
  return typeof value === 'string' && Object.hasOwn(MAP_CATEGORIES, value);
}
export interface NetworkMapEntry {
  id: string;
  name: string;
  category: MapCategory | null;
  territory: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  profileHref: string | null;
}
export function hasCoordinates(entry: Pick<NetworkMapEntry, 'latitude' | 'longitude'>): boolean {
  return entry.latitude !== null && entry.longitude !== null &&
    Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude) &&
    Math.abs(entry.latitude) <= 90 && Math.abs(entry.longitude) <= 180;
}
export function safeWebsite(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
export function filterMapEntries(entries: readonly NetworkMapEntry[], category: string, state: string, query: string) {
  const needle = normalizeSearch(query);
  return entries.filter((entry) =>
    (category === '' || entry.category === category) &&
    (state === '' || entry.state === state) &&
    normalizeSearch([entry.name, entry.territory, entry.description, entry.city, entry.state].filter(Boolean).join(' ')).includes(needle),
  );
}
const optionalText = (max: number) => z.string().trim().max(max).nullable();
export const mapLocationSchema = z.object({
  subjectKey: z.string().min(1).max(200),
  category: z.enum(['STATE', 'MUNICIPALITY', 'SECTION', 'HONORARY']),
  enabled: z.boolean(),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  address: optionalText(300), city: optionalText(160), state: optionalText(160),
  contactName: optionalText(160),
  email: z.email('Escribe un correo válido.').max(320).nullable(),
  phone: z.string().trim().max(40).regex(/^[+\d\s().-]+$/, 'Revisa el teléfono.').nullable(),
  website: optionalText(500).refine((value) => value === null || safeWebsite(value) !== null, 'Usa una dirección http o https.'),
}).superRefine((value, ctx) => {
  if ((value.latitude === null) !== (value.longitude === null) || (value.enabled && !hasCoordinates(value))) {
    ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Selecciona una ubicación o captura ambas coordenadas para publicarla.' });
  }
});
