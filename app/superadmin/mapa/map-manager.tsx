'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Checkbox, ErrorNotice, Field, Select, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import type { ManagedMapEntry } from '@/modules/network-map';
import { MAP_CATEGORIES, normalizeSearch } from '@/modules/network-map/public';
import { saveMapAction, type MapFormState } from './actions';

const MapCanvas = dynamic(() => import('@/components/network-map/map-canvas'), { ssr: false, loading: () => <p role="status">Cargando selector de ubicación…</p> });
const initial: MapFormState = { status: 'idle' };

export function MapManager({ entries }: { entries: ManagedMapEntry[] }) {
  const [selectedId, setSelectedId] = useState(entries[0]?.entry.id ?? '');
  const [query, setQuery] = useState('');
  const selected = entries.find(({ entry }) => entry.id === selectedId);
  const options = entries.filter(({ entry }) => normalizeSearch(`${entry.name} ${entry.territory ?? ''}`).includes(normalizeSearch(query)));
  return <div className="space-y-6">
    <Link href="/mapa" className="inline-flex min-h-11 items-center font-semibold underline">Ver mapa público →</Link>
    <label className="block">Buscar registro
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3" />
    </label>
    <label className="block">Delegación o agremiado honorario
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
        <option value="">Selecciona un registro</option>
        {selected && !options.some(({ entry }) => entry.id === selectedId) && <option value={selectedId}>{selected.entry.name}</option>}
        {options.map(({ entry, enabled }) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.category ? MAP_CATEGORIES[entry.category] : 'Delegación territorial'}{enabled ? ' · Ubicación publicada' : ''}</option>)}
      </select>
    </label>
    {options.length === 0 && <p role="status">No hay coincidencias con esa búsqueda.</p>}
    {selected && <LocationForm key={selectedId} item={selected} />}
  </div>;
}

function LocationForm({ item }: { item: ManagedMapEntry }) {
  const { entry } = item;
  const [result, action, pending] = useActionState(saveMapAction, initial);
  const [latitude, setLatitude] = useState(entry.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(entry.longitude?.toString() ?? '');
  const points = useMemo(() => [{ ...entry, latitude: latitude === '' ? null : Number(latitude), longitude: longitude === '' ? null : Number(longitude) }], [entry, latitude, longitude]);
  return <form action={action} className="space-y-5 rounded-xl border border-[var(--color-line)] p-5">
    <h2 className="text-xl font-bold">{entry.name}</h2>
    <input type="hidden" name="subjectKey" value={entry.id} />
    {result.status === 'error' && <ErrorNotice title={result.message ?? 'No se pudo guardar'}><ul>{Object.values(result.fieldErrors ?? {}).flat().map((message) => <li key={message}>{message}</li>)}</ul></ErrorNotice>}
    {result.status === 'ok' && <SuccessNotice title={result.message ?? 'Guardado'} />}
    {entry.id.startsWith('delegation:') ? <Select name="category" label="Nivel de delegación" required defaultValue={entry.category ?? ''} options={Object.entries(MAP_CATEGORIES).filter(([key]) => key !== 'HONORARY').map(([value, label]) => ({ value, label }))} errors={result.fieldErrors?.['category']} /> : <input type="hidden" name="category" value="HONORARY" />}
    <p className="text-sm text-[var(--color-ink-soft)]">Selecciona la sede de atención pública. Acerca el mapa y haz clic en el lugar exacto, o captura sus coordenadas.</p>
    <MapCanvas entries={points} onPick={(lat, lng) => { setLatitude(String(lat)); setLongitude(String(lng)); }} />
    <div className="grid gap-4 sm:grid-cols-2">
      <label>Latitud<input name="latitude" type="number" min={-90} max={90} step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className="mt-2 min-h-11 w-full rounded border border-[var(--color-line)] bg-[var(--color-surface)] p-3" /></label>
      <label>Longitud<input name="longitude" type="number" min={-180} max={180} step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className="mt-2 min-h-11 w-full rounded border border-[var(--color-line)] bg-[var(--color-surface)] p-3" /></label>
      <Field name="city" label="Ciudad o municipio" defaultValue={entry.city ?? ''} />
      <Field name="state" label="Estado" defaultValue={entry.state ?? ''} />
      <Field name="address" label="Dirección pública de atención" defaultValue={entry.address ?? ''} />
      <Field name="contactName" label="Persona o área de contacto público" defaultValue={entry.contactName ?? ''} />
      <Field name="email" type="email" label="Correo público" defaultValue={entry.email ?? ''} />
      <Field name="phone" type="tel" label="Teléfono público" defaultValue={entry.phone ?? ''} />
      <Field name="website" type="url" label="Sitio web" defaultValue={entry.website ?? ''} />
    </div>
    <Checkbox name="enabled" defaultChecked={item.enabled} label="Publicar esta ubicación y estos datos de contacto autorizados" help="Usa únicamente datos institucionales o autorizados para difusión pública. Al desmarcar, se retiran del mapa; la ficha del directorio conserva su autorización independiente." />
    <SubmitButton>{pending ? 'Guardando…' : 'Guardar ubicación y contacto'}</SubmitButton>
  </form>;
}
