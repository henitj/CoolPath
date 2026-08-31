import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { HOSTED_FALLBACK, apiUrlFromHostUri, apiUrlFromPreviewHost, hostFromManifest, normalizeBaseUrl } from './url'

export { HOSTED_FALLBACK, apiUrlFromHostUri, apiUrlFromPreviewHost, normalizeBaseUrl }

/**
 * API base URL resolution order:
 *  1. user override (Settings screen, persisted)
 *  2. the machine running Metro/Expo Go — when you scan the QR code, Expo's
 *     manifest carries `hostUri` (e.g. "192.168.1.20:8081"); the backend runs
 *     on the same machine at :8000, so the phone reaches it with zero setup.
 *  3. platform defaults (Android emulator → 10.0.2.2, web → same host :8000)
 *  4. hosted fallback
 */
export function platformDefaults(): string[] {
  const list: string[] = []
  if (Platform.OS === 'android') list.push('http://10.0.2.2:8000')
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    const preview = apiUrlFromPreviewHost(location.hostname)
    if (preview) list.push(preview)
    else list.push(`${location.protocol}//${location.hostname}:8000`)
  }
  list.push('http://localhost:8000')
  return list
}

/** Current best-guess API base (before the user overrides anything). */
export function autoDetectApiUrl(): string {
  const expoConfigHost = Constants?.expoConfig?.hostUri
  const manifestHost = hostFromManifest((Constants as unknown as { manifest?: unknown })?.manifest)
  const fromExpo = apiUrlFromHostUri(expoConfigHost) ?? apiUrlFromHostUri(manifestHost)
  if (fromExpo) return fromExpo
  return platformDefaults()[0] ?? HOSTED_FALLBACK
}

export const STORAGE_KEYS = {
  apiUrl: 'coolpath.apiUrl.v1',
  units: 'coolpath.units.v1',
  haptics: 'coolpath.haptics.v1',
  savedPlaces: 'coolpath.savedPlaces.v1',
  lastOrigin: 'coolpath.lastOrigin.v1',
} as const
