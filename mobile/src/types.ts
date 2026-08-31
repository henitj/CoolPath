export type ProfileId = 'cool' | 'safe' | 'fastest'

export interface NowConditions {
  lat: number
  lon: number
  timestamp: string
  temp_c: number
  ndvi: number
  shadow_pct: number
  canopy_pct: number
  shade_pct: number
  comfort: number
  sun: { altitude_deg: number; azimuth_deg: number; is_daytime: boolean }
  sources: { temperature: string; vegetation: string }
}

export interface RouteMetrics {
  distance_m: number
  est_walk_min: number
  effort_min: number
  avg_temp_c: number
  max_temp_c: number
  avg_ndvi: number
  canopy_pct: number
  shadow_pct: number
  shade_pct: number
  hazard_count: number
  comfort_score: number
}

export interface Comparison {
  distance_delta_m: number
  distance_delta_pct: number
  temp_delta_c: number
  max_temp_delta_c: number
  shade_delta_pct: number
  comfort_delta: number
  hazard_delta: number
  effort_delta_min: number
}

export interface RouteFeature {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  properties: {
    profile: ProfileId
    label: string
    color: string
    metrics: RouteMetrics
    timestamp?: string
    warnings?: string[]
  }
}

export interface RouteResponse extends RouteFeature {
  comparison: Comparison | null
  baseline: RouteFeature | null
}

export interface Hazard {
  id: number
  category: string
  severity: number
  note: string
  lat: number
  lon: number
  reporter: string | null
  status: string
  created_at: string
  age_hours: number
  label: string
  color: string
  weight: number
}

export interface HazardFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Hazard
}

export interface Place {
  id: string
  name: string
  lon: number
  lat: number
  kind: string
  blurb: string
}

export interface MetaInfo {
  name: string
  version: string
  bbox: number[]
  profiles: { id: ProfileId; label: string; description: string }[]
  hazard_categories: { id: string; label: string; color: string; weight: number }[]
}

export type Units = 'C' | 'F'

export interface LatLon {
  lat: number
  lon: number
}
