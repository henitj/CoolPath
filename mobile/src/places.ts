import type { Place } from './types'

/**
 * Client-side fallback catalogue (mirrors the backend's curated list) so the
 * destination picker still works when the API is unreachable — the app stays
 * useful, it just can't score the routes until the server is back.
 */
export const FALLBACK_PLACES: Place[] = [
  { id: 'texas-state-capitol', name: 'Texas State Capitol', lon: -97.7369, lat: 30.2747, kind: 'landmark', blurb: 'Shaded grounds and grand lawns' },
  { id: 'rainey-street', name: 'Rainey Street District', lon: -97.7358, lat: 30.2638, kind: 'district', blurb: 'Bungalow bars under pecan trees' },
  { id: 'lady-bird-lake-trail-congress', name: 'Lady Bird Lake Trail @ Congress', lon: -97.7425, lat: 30.2613, kind: 'trail', blurb: 'Lakefront loop, coolest air' },
  { id: 'waterloo-park', name: 'Waterloo Park', lon: -97.7355, lat: 30.2723, kind: 'park', blurb: '12 acres of canopy and lawn' },
  { id: 'republic-square', name: 'Republic Square', lon: -97.7462, lat: 30.2654, kind: 'park', blurb: 'Historic square, elm canopy' },
  { id: '2nd-street-district', name: '2nd Street District', lon: -97.7462, lat: 30.2645, kind: 'district', blurb: 'Patios between City Hall and the lake' },
  { id: '6th-street', name: 'Sixth Street', lon: -97.7395, lat: 30.2674, kind: 'district', blurb: 'Historic strip, brick pavers' },
  { id: 'shoal-creek-trail-9th', name: 'Shoal Creek Trail @ 9th', lon: -97.7521, lat: 30.27, kind: 'trail', blurb: 'Riparian corridor, shaded' },
  { id: 'butler-metro-park', name: 'Butler Metro Park', lon: -97.7495, lat: 30.2608, kind: 'park', blurb: 'Lakeside lawn and bluff view' },
  { id: 'congress-6th', name: 'Congress Ave & 6th St', lon: -97.7425, lat: 30.2674, kind: 'intersection', blurb: 'Center of downtown' },
]

export const KIND_META: Record<string, { label: string }> = {
  landmark: { label: 'Landmark' },
  plaza: { label: 'Plaza' },
  district: { label: 'District' },
  trail: { label: 'Trail' },
  park: { label: 'Park' },
  campus: { label: 'Campus' },
  intersection: { label: 'Corner' },
}

export function kindMeta(kind: string): { label: string } {
  return KIND_META[kind] ?? { label: 'Place' }
}

export function filterPlaces(places: Place[], query: string): Place[] {
  const q = query.trim().toLowerCase()
  if (!q) return places
  return places.filter(
    (p) => p.name.toLowerCase().includes(q) || p.kind.toLowerCase().includes(q) || p.blurb.toLowerCase().includes(q),
  )
}

export function nearestPlace(places: Place[], lat: number, lon: number): Place | null {
  let best: Place | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const p of places) {
    const dLat = p.lat - lat
    const dLon = (p.lon - lon) * 0.86
    const d = dLat * dLat + dLon * dLon
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}
