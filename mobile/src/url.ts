/**
 * Pure URL helpers. They deliberately do not import React Native so the QR/LAN
 * address behavior stays simple to unit test.
 */

/** A local default is honest when no deployed API has been configured. */
export const HOSTED_FALLBACK = 'http://localhost:8000'

/**
 * Convert a Metro host URI to the backend on the same development machine.
 * Supports the shapes Expo has used for manifests: `192.168.1.20:8081`,
 * `exp://192.168.1.20:8081`, and `my-mac.local:8081`.
 */
export function apiUrlFromHostUri(hostUri: string | undefined | null): string | null {
  const host = hostNameFromUri(hostUri)
  if (!host || isUnroutableHost(host)) return null
  return host.includes(':') ? `http://[${host}]:8000` : `http://${host}:8000`
}

function hostNameFromUri(hostUri: string | undefined | null): string | null {
  if (!hostUri || typeof hostUri !== 'string') return null
  let raw = hostUri.trim()
  if (!raw) return null
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  raw = raw.split(/[/?#]/, 1)[0]
  if (!raw) return null
  if (raw.startsWith('[')) {
    const closing = raw.indexOf(']')
    return closing > 1 ? raw.slice(1, closing) : null
  }
  return raw.split(':', 1)[0] || null
}

function isUnroutableHost(host: string): boolean {
  const normalised = host.toLowerCase()
  return normalised === 'localhost' || normalised === '127.0.0.1' || normalised === '0.0.0.0' || normalised === '::1'
}

export function normalizeBaseUrl(url: string, fallback = ''): string {
  let u = (url ?? '').trim().replace(/\s+/g, '')
  if (!u) return fallback
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  u = u.replace(/\/+$/, '')
  u = u.replace(/\/api\/v1$/i, '')
  return u
}

/**
 * Sandbox/preview hosts: `8081-abc123.e2b.app` serves the app while the API
 * lives at `8000-abc123.e2b.app`. Returns null for normal hosts.
 */
export function apiUrlFromPreviewHost(hostname: string | undefined | null): string | null {
  if (!hostname || typeof hostname !== 'string') return null
  const m = hostname.match(/^(\d+)-([a-z0-9.-]+)$/i)
  if (!m) return null
  return `https://8000-${m[2]}`
}

/** Find possible Metro hosts in classic, modern, and Expo Go manifest shapes. */
export function manifestHostUris(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object') return []
  const root = manifest as Record<string, unknown>
  const extra = root.extra as Record<string, unknown> | undefined
  const expoClient = extra?.expoClient as Record<string, unknown> | undefined
  const candidates = [root.hostUri, root.debuggerHost, expoClient?.hostUri, expoClient?.debuggerHost]
  return candidates.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

/** Backwards-compatible helper for the first host in a manifest object. */
export function hostFromManifest(manifest: unknown): string | null {
  return manifestHostUris(manifest)[0] ?? null
}
