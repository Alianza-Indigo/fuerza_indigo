'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { filterMapEntries, hasCoordinates, MAP_CATEGORIES, MAP_COLORS, type MapCategory, type NetworkMapEntry } from '@/modules/network-map/public';
import { directionsUrl } from '@/platform/config/network-map';

const MapCanvas = dynamic(() => import('./map-canvas'), { ssr: false, loading: () => <p role="status" className="grid h-[380px] place-items-center rounded-2xl bg-white/5 sm:h-[480px]">Cargando mapa…</p> });
const control = 'mt-2 min-h-12 w-full rounded-lg border border-cyan-300/40 bg-[#091638] px-3 text-white focus:outline-2 focus:outline-offset-2 focus:outline-cyan-300';

export function NetworkExplorer({ entries, initialCategory = '' }: { entries: NetworkMapEntry[]; initialCategory?: MapCategory | '' }) {
  const prefix = useId();
  const [category, setCategory] = useState<string>(initialCategory);
  const [state, setState] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [limit, setLimit] = useState(12);
  const filtered = useMemo(() => filterMapEntries(entries, category, state, query), [entries, category, state, query]);
  const states = [...new Set(entries.flatMap((entry) => entry.state ? [entry.state] : []))].sort((a, b) => a.localeCompare(b, 'es'));
  const selectedEntries = filtered.filter((entry) => selected.includes(entry.id));
  const located = filtered.filter(hasCoordinates).length;
  function resetSelection() { setSelected([]); setLimit(12); }
  function selectPoints(ids: string[]) {
    setSelected(ids);
    requestAnimationFrame(() => document.getElementById(`${prefix}-selection`)?.focus({ preventScroll: false }));
  }
  return <div className="space-y-5">
    <fieldset className="grid gap-4 rounded-2xl border border-cyan-300/25 bg-white/5 p-4 md:grid-cols-3">
      <legend className="px-2 font-bold text-cyan-200">Explora nuestra red</legend>
      <label htmlFor={`${prefix}-category`} className="text-sm font-semibold">Mostrar
        <select id={`${prefix}-category`} value={category} className={control} onChange={(event) => { setCategory(event.target.value); resetSelection(); }}>
          <option value="">Toda la red</option>
          {Object.entries(MAP_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label htmlFor={`${prefix}-state`} className="text-sm font-semibold">Estado
        <select id={`${prefix}-state`} className={control} value={state} onChange={(event) => { setState(event.target.value); resetSelection(); }}>
          <option value="">Todos los estados</option>
          {states.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label htmlFor={`${prefix}-query`} className="text-sm font-semibold">Nombre, ciudad o especialidad
        <input id={`${prefix}-query`} type="search" value={query} className={control} onChange={(event) => { setQuery(event.target.value); resetSelection(); }} />
      </label>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Vista del directorio" className="flex gap-2">
        {(['map', 'list'] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} className={`min-h-11 rounded-lg border px-5 font-bold ${view === mode ? 'border-cyan-300 bg-cyan-300 text-[#030923]' : 'border-white/30 text-white'}`}>{mode === 'map' ? 'Mapa' : 'Lista'}</button>)}
      </div>
      <button type="button" className="min-h-11 px-3 text-sm font-bold text-cyan-200 underline" onClick={() => { setCategory(''); setState(''); setQuery(''); resetSelection(); }}>Limpiar filtros</button>
    </div>
    <p role="status" className="text-sm text-blue-100">{filtered.length} registros · {located} con ubicación en el mapa{filtered.length > located ? ` · ${filtered.length - located} disponibles solo en la lista` : ''}</p>
    {view === 'map' && <>
      <MapCanvas entries={filtered} onSelect={selectPoints} />
      <ul aria-label="Colores del mapa" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-blue-100">
        {Object.entries(MAP_CATEGORIES).map(([key, label]) => <li key={key} className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full border border-white/60" style={{ background: MAP_COLORS[key as MapCategory] }} />{label}</li>)}
      </ul>
      {selectedEntries.length > 0 && <section id={`${prefix}-selection`} tabIndex={-1} aria-label="Contactos seleccionados" className="rounded-xl border-2 border-cyan-300 p-4 outline-none">
        <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{selectedEntries.length > 1 ? 'Contactos en esta ubicación' : 'Contacto seleccionado'}</h3><button type="button" onClick={() => setSelected([])} className="min-h-11 px-3 text-sm underline">Cerrar ficha</button></div>
        <div className="mt-3 grid gap-4 md:grid-cols-2">{selectedEntries.map((entry) => <ContactCard key={entry.id} entry={entry} />)}</div>
      </section>}
    </>}
    {filtered.length === 0 ? <div className="rounded-xl border border-white/20 p-6"><h3 className="font-bold">No hay registros con estas opciones</h3><p className="mt-2 text-sm text-blue-100">Prueba otra categoría o limpia los filtros.</p></div> : <>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{filtered.slice(0, limit).map((entry) => <li key={entry.id}><ContactCard entry={entry} /></li>)}</ul>
      {filtered.length > limit && <button type="button" className="min-h-11 rounded-lg border border-cyan-300 px-5 font-bold" onClick={() => setLimit((current) => current + 12)}>Mostrar más contactos ({filtered.length - limit})</button>}
    </>}
  </div>;
}

function ContactCard({ entry }: { entry: NetworkMapEntry }) {
  const phone = entry.phone?.replace(/[^+\d]/g, '') ?? '';
  return <article className="h-full rounded-xl border border-cyan-300/25 bg-[#071133] p-5">
    <p className="text-xs font-bold uppercase tracking-wide text-cyan-200">{entry.category === null ? 'Delegación territorial' : MAP_CATEGORIES[entry.category]}</p>
    <h3 className="mt-2 text-lg font-bold">{entry.name}</h3>
    {entry.description && <p className="mt-2 text-sm text-blue-100">{entry.description}</p>}
    <p className="mt-2 text-sm text-blue-100">{[entry.city, entry.state].filter(Boolean).join(', ') || entry.territory}</p>
    {entry.address && <p className="mt-2 text-sm text-blue-100">{entry.address}</p>}
    {entry.contactName && <p className="mt-3 text-sm">Contacto: {entry.contactName}</p>}
    <div className="mt-3 flex flex-col items-start gap-1 break-all text-sm font-semibold text-cyan-200">
      {entry.email && <a href={`mailto:${entry.email}`} className="inline-flex min-h-11 items-center underline">{entry.email}</a>}
      {phone && <a href={`tel:${phone}`} className="inline-flex min-h-11 items-center underline">{entry.phone}</a>}
      {entry.website && <a href={entry.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">Sitio web ↗</a>}
      {hasCoordinates(entry) && <a href={directionsUrl(entry.latitude!, entry.longitude!)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">Cómo llegar ↗</a>}
      {entry.profileHref && <Link href={entry.profileHref} className="inline-flex min-h-11 items-center underline">Ver ficha pública</Link>}
      {!entry.email && !phone && !entry.website && <Link href="/contacto" className="inline-flex min-h-11 items-center underline">Contactar mediante Fuerza Índigo</Link>}
    </div>
  </article>;
}
