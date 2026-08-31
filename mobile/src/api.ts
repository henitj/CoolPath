import { normalizeBaseUrl, autoDetectApiUrl } from './config'
import type {
  Hazard,
  HazardFeature,
  MetaInfo,
  NowConditions,
  Place,
  ProfileId,
  RouteResponse,
} from './types'

export type ApiState = 'idle' | 'ok' | 'unreachable'

export class ApiUnreachableError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'ApiUnreachableError'
  }
}

const TIMEOUT_MS = 9000

interface ApiConfig {
  baseUrl: string
}

let cfg: ApiConfig = { baseUrl: autoDetectApiUrl() }

export function setBaseUrl(url: string | null | undefined) {
  cfg.baseUrl = url ? normalizeBaseUrl(url) : autoDetectApiUrl()
}

export function getBaseUrl(): string {
  return cfg.baseUrl
}

export function friendlyError(err: unknown): string {
  if (err instanceof ApiUnreachableError) {
    return "Can't reach the CoolPath server. Check that the backend is running and the address is right in Settings."
  }
  if (err instanceof Error) {
    if (/aborted|timeout/i.test(err.message)) return 'The server took too long to answer. Try again.'
    if (/network|fetch/i.test(err.message)) return 'Network hiccup — check your connection and try again.'
    return err.message
  }
  return 'Something unexpected happened. Try again.'
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? TIMEOUT_MS)
  try {
    const resp = await fetch(`${cfg.baseUrl}/api/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!resp.ok) {
      let detail = `${resp.status}`
      try {
        const body = (await resp.json()) as { detail?: unknown }
        if (body && typeof body.detail === 'string') detail = body.detail
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(resp.status, detail)
    }
    return (await resp.json()) as T
  } catch (err) {
    // Normalise low-level failures into ApiUnreachableError so the UI can
    // respond calmly instead of crashing.
    if (err instanceof ApiError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    if (/abort/i.test(msg)) throw new ApiUnreachableError('timeout')
    throw new ApiUnreachableError(msg)
  } finally {
    clearTimeout(timer)
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const api = {
  meta: () => request<MetaInfo>('/meta', { timeoutMs: 5000 }),

  now: (lat: number, lon: number) =>
    request<NowConditions>(`/now?lat=${lat}&lon=${lon}`),

  places: () => request<{ places: Place[] }>('/places', { timeoutMs: 6000 }),

  route: (payload: {
    origin: [number, number]
    destination: [number, number]
    profile: ProfileId
  }) => request<RouteResponse>('/route', { method: 'POST', body: JSON.stringify(payload) }),

  hazards: () =>
    request<{ type: 'FeatureCollection'; features: HazardFeature[]; count: number }>('/hazards'),

  createHazard: (payload: {
    category: string
    lat: number
    lon: number
    severity: number
    note?: string
    reporter?: string
  }) => request<Hazard>('/hazards', { method: 'POST', body: JSON.stringify(payload) }),

  networkStats: () =>
    request<{ nodes: number; edges: number; total_km: number; source: string }>(
      '/layers/network/stats',
      { timeoutMs: 5000 },
    ),
}

/** Lightweight reachability probe (fast timeout, no parsing). */
export async function probe(baseUrl?: string): Promise<boolean> {
  const base = baseUrl ? normalizeBaseUrl(baseUrl) : cfg.baseUrl
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3500)
  try {
    const resp = await fetch(`${base}/api/v1/health`, { signal: controller.signal })
    return resp.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
