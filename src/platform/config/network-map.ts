/** Cartographic provider; keep CSP and attribution aligned with these endpoints. */
export const MAP_TILE_ORIGIN = 'https://tile.openstreetmap.org';
export const MAP_TILE_URL = `${MAP_TILE_ORIGIN}/{z}/{x}/{y}.png`;
export const MAP_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export function directionsUrl(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/directions?to=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
