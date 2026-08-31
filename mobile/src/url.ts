/**
 * Pure URL helpers (no React Native imports) so they stay unit-testable.
 */

export const HOSTED_FALLBACK = 'https://coolpath-demo.example.com'

/** "192.168.1.20:8081" -> "http://192.168.1.20:8000" (null when unusable) */
export function apiUrlFromHostUri(hostUri: string | undefined | null): string | null {
  if (!hostUri || typeof hostUri !== 'string') return null
  const host = hostUri.split(':')[0]
  if (!host || isUnroutableHost(host)) return null
  return `http://${host}:8000`
}

function isUnroutableHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  )
}

export function normalizeBaseUrl(url: string, fallback = ''): string {
  let u = (url ?? '').trim().replace(/\s+/g, '')
  if (!u) return fallback
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  u = u.replace(/\/+$/, '')
  u = u.replace(/\/api\/v1$/, '')
  return u
}

/**
 * Sandbox/preview hosts: "8081-abc123.e2b.app" serves the app while the API
 * lives at "8000-abc123.e2b.app". Returns null for normal hosts.
 */
export function apiUrlFromPreviewHost(hostname: string | undefined | null): string | null {
  if (!hostname || typeof hostname !== 'string') return null
  const m = hostname.match(/^(\d+)-([a-z0-9.-]+)$/i)
  if (!m) return null
  return `https://8000-${m[2]}`
}

/** Extract host:port from a metro/expo manifest-ish value, tolerantly. */
export function hostFromManifest(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== 'object') return null
  const hostUri = (manifest as { hostUri?: unknown }).hostUri
  return typeof hostUri === 'string' ? hostUri : null
}
