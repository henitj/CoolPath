import { Platform } from 'react-native'
import Constants from 'expo-constants'
import {
  HOSTED_FALLBACK,
  apiUrlFromHostUri,
  apiUrlFromPreviewHost,
  manifestHostUris,
  normalizeBaseUrl,
} from './url'

export { HOSTED_FALLBACK, apiUrlFromHostUri, apiUrlFromPreviewHost, normalizeBaseUrl }

/**
 * API base URL resolution order:
 *  1. an EXPO_PUBLIC_API_URL / app-config URL, for a deployed API or tunnel;
 *  2. Metro's LAN host from the Expo Go manifest (the usual QR workflow);
 *  3. emulator/browser defaults; and
 *  4. localhost, which the Profile connection panel clearly labels as a
 *     development fallback rather than pretending a public service exists.
 */
export function platformDefaults(): string[] {
  const list: string[] = []
  if (Platform.OS === 'android') list.push('http://10.0.2.2:8000')
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    const preview = apiUrlFromPreviewHost(location.hostname)
    if (preview) list.push(preview)
    else list.push(`${location.protocol}//${location.hostname}:8000`)
  }
  list.push(HOSTED_FALLBACK)
  return list
}

type LooseExpoConstants = {
  expoConfig?: {
    hostUri?: unknown
    extra?: { apiUrl?: unknown }
  }
  manifest?: unknown
  manifest2?: unknown
  expoGoConfig?: { debuggerHost?: unknown }
}

function configuredApiUrl(): string | null {
  const constants = Constants as unknown as LooseExpoConstants
  const environmentUrl = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_API_URL : undefined
  const configUrl = constants.expoConfig?.extra?.apiUrl
  const candidate = environmentUrl || (typeof configUrl === 'string' ? configUrl : '')
  if (!candidate || !candidate.trim()) return null
  return normalizeBaseUrl(candidate)
}

/** Return all manifest host values without depending on one Expo SDK shape. */
export function expoManifestHosts(): string[] {
  const constants = Constants as unknown as LooseExpoConstants
  const configHost = constants.expoConfig?.hostUri
  const goHost = constants.expoGoConfig?.debuggerHost
  return [
    ...(typeof configHost === 'string' ? [configHost] : []),
    ...(typeof goHost === 'string' ? [goHost] : []),
    ...manifestHostUris(constants.manifest),
    ...manifestHostUris(constants.manifest2),
  ]
}

/** Current best API guess before a person overrides it in Profile. */
export function autoDetectApiUrl(): string {
  const configured = configuredApiUrl()
  if (configured) return configured
  for (const host of expoManifestHosts()) {
    const apiUrl = apiUrlFromHostUri(host)
    if (apiUrl) return apiUrl
  }
  return platformDefaults()[0] ?? HOSTED_FALLBACK
}

export const STORAGE_KEYS = {
  apiUrl: 'coolpath.apiUrl.v2',
  units: 'coolpath.units.v1',
  haptics: 'coolpath.haptics.v1',
  savedPlaces: 'coolpath.savedPlaces.v1',
  lastOrigin: 'coolpath.lastOrigin.v1',
  routingPreferences: 'coolpath.routingPreferences.v1',
  walkHistory: 'coolpath.walkHistory.v1',
} as const
