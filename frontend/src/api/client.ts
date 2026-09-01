import type {
  FeatureCollection,
  HazardCollection,
  MetaResponse,
  Place,
  PlaceSearchResponse,
  ProfileId,
  RoadConditionsResponse,
  RouteResponse,
  SatelliteStatus,
  ShadowResponse,
} from '../types'

export const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...init,
  })
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`
    try {
      const body = await resp.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // Keep the useful status fallback when an intermediary sends non-JSON.
    }
    throw new ApiError(resp.status, detail)
  }
  return resp.json() as Promise<T>
}

export interface RoutePayload {
  origin: [number, number]
  destination: [number, number]
  profile: ProfileId
  timestamp?: string
  include_baseline?: boolean
  avoid_red_paths?: boolean
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  meta: () => request<MetaResponse>('/meta'),

  route: (payload: RoutePayload) =>
    request<RouteResponse>('/route', { method: 'POST', body: JSON.stringify(payload) }),

  places: () => request<{ places: Place[] }>('/places'),

  searchPlaces: (query: string, limit = 8) =>
    request<PlaceSearchResponse>(`/places/search?${new URLSearchParams({ q: query, limit: String(limit) })}`),

  hazards: (bbox?: [number, number, number, number], activeOnly = true) => {
    const params = new URLSearchParams({ active_only: String(activeOnly) })
    if (bbox) params.set('bbox', bbox.join(','))
    return request<HazardCollection>(`/hazards?${params}`)
  },

  createHazard: (payload: {
    category: string
    lat: number
    lon: number
    severity: number
    note?: string
    reporter?: string
  }) => request('/hazards', { method: 'POST', body: JSON.stringify(payload) }),

  deleteHazard: (id: number) => request(`/hazards/${id}`, { method: 'DELETE' }),

  hazardCategories: () => request<{ categories: { id: string; label: string; color: string; weight: number }[] }>(
    '/hazards/categories',
  ),

  layer: (name: 'buildings' | 'canopy' | 'water' | 'parks' | 'heat') =>
    request<FeatureCollection>(`/layers/${name}`),

  roadConditions: (timestamp?: string) =>
    request<RoadConditionsResponse>(
      `/layers/road-conditions${timestamp ? `?timestamp=${encodeURIComponent(timestamp)}` : ''}`,
    ),

  shadows: (timestamp?: string) =>
    request<ShadowResponse>(`/layers/shadows${timestamp ? `?timestamp=${encodeURIComponent(timestamp)}` : ''}`),

  satelliteStatus: () => request<SatelliteStatus>('/satellite/status'),

  refreshSatellite: () => request<Record<string, unknown>>('/satellite/refresh', { method: 'POST' }),

  networkStats: () =>
    request<{
      nodes: number
      edges: number
      total_km: number
      source: string
      buildings: number
    }>('/layers/network/stats'),
}

export function bboxAround(lon: number, lat: number, deltaDeg = 0.02): [number, number, number, number] {
  return [lon - deltaDeg, lat - deltaDeg * 0.85, lon + deltaDeg, lat + deltaDeg * 0.85]
}
