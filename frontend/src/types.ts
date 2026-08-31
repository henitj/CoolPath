export type ProfileId = 'fastest' | 'cool' | 'safe'

export interface Metrics {
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
    metrics: Metrics
    timestamp?: string
    samples?: { temp_c: number[]; ndvi: number[]; shade: number[] }
    warnings?: string[]
  }
}

export interface RouteResponse extends RouteFeature {
  comparison: Comparison | null
  baseline: RouteFeature | null
}

export interface HazardProperties {
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
  properties: HazardProperties
}

export interface HazardCollection {
  type: 'FeatureCollection'
  features: HazardFeature[]
  count: number
}

export interface HazardCategory {
  id: string
  label: string
  color: string
  weight: number
}

export interface SourceStatus {
  key: string
  name: string
  priority: number
  mode: 'live' | 'snapshot'
  detail: string
  checked_at: string | null
  latency_ms: number | null
}

export interface SatelliteStatus {
  generated_at: string
  mode: 'live' | 'snapshot' | 'offline'
  sources: SourceStatus[]
  environment_sources: { lst: string; ndvi: string }
  fallback_chain: string[]
}

export interface LayerProps {
  lst_c: number
  ndvi: number
  warmth: number
}

export interface FeatureCollection {
  type: 'FeatureCollection'
  features: Record<string, unknown>[]
  properties?: Record<string, unknown>
  bbox?: number[]
}

export interface ShadowResponse {
  type: 'Feature'
  properties: {
    timestamp: string
    altitude_deg: number
    azimuth_deg: number
    is_daytime: boolean
    building_count: number
    source: string
  }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null
}

export interface ProfileMeta {
  id: ProfileId
  label: string
  description: string
  alpha: number
  beta: number
  gamma: number
}
