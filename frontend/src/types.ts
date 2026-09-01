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

export interface FeatureCollection<TFeature = Record<string, unknown>> {
  type: 'FeatureCollection'
  features: TFeature[]
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

export interface Place {
  id: string
  name: string
  lon: number
  lat: number
  kind: string
  blurb: string
}

/** A place after it has been selected as a route start, end, or map pin. */
export interface MapLocation {
  id: string
  name: string
  coordinates: [number, number]
  detail?: string
  source: 'search' | 'coordinates' | 'map' | 'location'
}

export interface PlaceSearchResponse {
  places: Place[]
  source: string
}

export interface RoadConditionProperties {
  name: string
  quality: number
  status: 'Excellent' | 'Good' | 'Use care' | 'Poor'
  color: string
  temp_c: number
  shade_pct: number
  shadow_pct: number
  hazard_penalty: number
  sidewalk: boolean
  lit: boolean
}

export interface RoadConditionFeature {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  properties: RoadConditionProperties
}

export type RoadConditionsResponse = FeatureCollection<RoadConditionFeature>

export interface MetaResponse {
  name: string
  tagline: string
  version: string
  bbox: [number, number, number, number]
  center: { lat: number; lon: number }
  timezone: string
}
