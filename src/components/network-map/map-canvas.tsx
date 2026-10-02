'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '@/platform/config/network-map';
import { hasCoordinates, MAP_COLORS, type NetworkMapEntry } from '@/modules/network-map/public';

interface Props {
  entries: readonly NetworkMapEntry[];
  onSelect?: (ids: string[]) => void;
  onPick?: (latitude: number, longitude: number) => void;
}

export default function MapCanvas({ entries, onSelect, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<maplibregl.Map | null>(null);
  const callbacks = useRef({ onSelect, onPick });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const picker = onPick !== undefined;
  useEffect(() => { callbacks.current = { onSelect, onPick }; }, [onSelect, onPick]);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    let disposed = false;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: { version: 8, sources: { osm: { type: 'raster', tiles: [MAP_TILE_URL], tileSize: 256, maxzoom: 19, attribution: MAP_ATTRIBUTION } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] },
        bounds: [[-118.5, 14.3], [-86.5, 33]], fitBoundsOptions: { padding: 24 },
        maxZoom: 19, renderWorldCopies: false, attributionControl: { compact: false },
        cooperativeGestures: !picker,
      });
    } catch {
      // WebGL can be unavailable; preserve the accessible directory/coordinate fields.
      queueMicrotask(() => { if (!disposed) setError(true); });
      return () => { disposed = true; };
    }
    instance.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    map.addControl(new maplibregl.FullscreenControl());
    map.on('error', () => { if (!disposed) setError(true); });
    map.on('load', () => {
      if (disposed) return;
      map.addSource('network', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: !picker, clusterRadius: 44, clusterMaxZoom: 16 });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'network', filter: ['has', 'point_count'], paint: { 'circle-color': '#312e81', 'circle-radius': ['step', ['get', 'point_count'], 20, 10, 26, 50, 32], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'network', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 14 }, paint: { 'text-color': '#fff' } });
      map.addLayer({ id: 'points', type: 'circle', source: 'network', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'category'], 'STATE', MAP_COLORS.STATE, 'MUNICIPALITY', MAP_COLORS.MUNICIPALITY, 'SECTION', MAP_COLORS.SECTION, 'HONORARY', MAP_COLORS.HONORARY, '#312e81'], 'circle-radius': 11, 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
      setReady(true);
    });
    map.on('click', 'clusters', (event) => {
      const feature = event.features?.[0];
      const clusterId: unknown = feature?.properties['cluster_id'];
      if (typeof clusterId !== 'number' || feature?.geometry.type !== 'Point') return;
      const coordinates = feature.geometry.coordinates as [number, number];
      const source = map.getSource('network') as maplibregl.GeoJSONSource;
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        if (!disposed) map.easeTo({ center: coordinates, zoom, duration: 200 });
      }).catch(() => { if (!disposed) setError(true); });
    });
    map.on('click', 'points', (event) => {
      if (picker) return;
      const ids = (event.features ?? []).flatMap((feature) => typeof feature.properties['id'] === 'string' ? [feature.properties['id']] : []);
      callbacks.current.onSelect?.([...new Set(ids)]);
    });
    map.on('click', (event) => {
      if (picker) callbacks.current.onPick?.(Number(event.lngLat.lat.toFixed(6)), Number(event.lngLat.lng.toFixed(6)));
    });
    for (const layer of ['points', 'clusters']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => { disposed = true; observer.disconnect(); map.remove(); instance.current = null; };
  }, [picker]);

  useEffect(() => {
    const map = instance.current;
    if (!ready || !map?.getSource('network')) return;
    const located = entries.filter(hasCoordinates);
    (map.getSource('network') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection', features: located.map((entry) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [entry.longitude!, entry.latitude!] }, properties: { id: entry.id, category: entry.category } })),
    });
    if (located.length) {
      const bounds = new maplibregl.LngLatBounds();
      for (const entry of located) bounds.extend([entry.longitude!, entry.latitude!]);
      map.fitBounds(bounds, { padding: 65, maxZoom: picker ? 16 : 13, duration: 0 });
    } else if (!picker) {
      map.fitBounds([[-118.5, 14.3], [-86.5, 33]], { padding: 24, duration: 0 });
    }
  }, [entries, ready, picker]);

  return <div>
    <div ref={container} role="region" aria-label={picker ? 'Seleccionar ubicación en el mapa' : 'Mapa de la red Fuerza Índigo. Contactos disponibles también en la lista.'} className="h-[380px] w-full overflow-hidden rounded-2xl bg-slate-100 text-slate-950 sm:h-[480px]" />
    {error && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">No se pudo cargar parte del mapa. Puedes consultar los contactos en la lista o usar los campos de coordenadas.</p>}
  </div>;
}
