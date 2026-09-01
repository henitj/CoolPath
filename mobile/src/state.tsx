/**
 * App-wide connection, map, GPS and walk-history state.
 *
 * Location updates intentionally use Expo Location's foreground watcher. That
 * keeps Expo Go compatible (no custom native background task is required) and
 * provides navigation-grade updates while the walk screen is open.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { api, friendlyError, probe, setBaseUrl } from './api'
import { STORAGE_KEYS, autoDetectApiUrl, normalizeBaseUrl } from './config'
import { haversineM } from './format'
import { FALLBACK_PLACES } from './places'
import type { HazardFeature, Place, ProfileId, Units } from './types'

export interface Coords {
  lat: number
  lon: number
  accuracy?: number
  heading?: number | null
  speed?: number | null
  ts: number
}

export interface RoutingPreferences {
  /** Favor any viable non-red detour over a poor-condition road segment. */
  avoidRedPaths: boolean
  /** The default is explicitly the shade-and-distance opportunity-cost route. */
  defaultProfile: ProfileId
}

export interface ActiveWalk {
  id: string
  startedAt: string
  startedLat: number
  startedLon: number
  distanceM: number
  pointCount: number
  destination?: string
}

export interface WalkRecord extends ActiveWalk {
  endedAt: string
  durationS: number
  endedLat: number
  endedLon: number
}

type LocationStatus = 'locating' | 'calibrating' | 'live' | 'fixed' | 'denied' | 'unavailable'

const DOWNTOWN: Coords = { lat: 30.2672, lon: -97.7431, ts: 0 }
const DOWNTOWN_BOUNDS = { minLon: -97.755, minLat: 30.26, maxLon: -97.73, maxLat: 30.278 }
const MAX_HISTORY = 60

interface AppState {
  // connection
  apiState: 'connecting' | 'ok' | 'down'
  apiBase: string
  apiOverride: string
  setApiOverride: (url: string | null) => void
  retryConnection: () => Promise<void>
  // location
  coords: Coords
  locationStatus: LocationStatus
  locationNote: string
  locationFixes: number
  isWithinCoverage: boolean
  coverageNote: string
  refreshLocation: () => Promise<void>
  calibrateGps: () => Promise<void>
  useDowntown: () => void
  // routing settings
  routingPreferences: RoutingPreferences
  setAvoidRedPaths: (value: boolean) => void
  setDefaultProfile: (profile: ProfileId) => void
  // foreground walk tracking
  activeWalk: ActiveWalk | null
  walkHistory: WalkRecord[]
  startWalk: (destination?: string) => Promise<boolean>
  stopWalk: () => Promise<WalkRecord | null>
  clearWalkHistory: () => void
  // general settings
  units: Units
  setUnits: (u: Units) => void
  hapticsOn: boolean
  setHapticsOn: (v: boolean) => void
  // API data
  places: Place[]
  hazards: HazardFeature[]
  dataNote: string
  refreshData: () => Promise<void>
  buzz: (style?: 'light' | 'success' | 'warn') => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}

function isInCoverage(point: Coords): boolean {
  return (
    point.lon >= DOWNTOWN_BOUNDS.minLon &&
    point.lon <= DOWNTOWN_BOUNDS.maxLon &&
    point.lat >= DOWNTOWN_BOUNDS.minLat &&
    point.lat <= DOWNTOWN_BOUNDS.maxLat
  )
}

function coverageMessage(point: Coords): string {
  if (point.ts === 0) return 'GPS has not been confirmed yet. Routing data covers Downtown Austin only.'
  if (!isInCoverage(point)) return 'You are outside the Downtown Austin walking-data coverage area. Choose a downtown start point.'
  return 'Live pedestrian routing coverage: Downtown Austin.'
}

function makeWalkId(): string {
  return `walk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key)
  } catch {
    return null
  }
}

function parsePreferences(raw: string | null): RoutingPreferences {
  if (!raw) return { avoidRedPaths: false, defaultProfile: 'cool' }
  try {
    const value = JSON.parse(raw) as Partial<RoutingPreferences>
    return {
      avoidRedPaths: value.avoidRedPaths === true,
      defaultProfile: value.defaultProfile === 'safe' || value.defaultProfile === 'fastest' ? value.defaultProfile : 'cool',
    }
  } catch {
    return { avoidRedPaths: false, defaultProfile: 'cool' }
  }
}

function parseWalkHistory(raw: string | null): WalkRecord[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isWalkRecord).slice(0, MAX_HISTORY)
  } catch {
    return []
  }
}

function isWalkRecord(value: unknown): value is WalkRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WalkRecord>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.startedAt === 'string' &&
    typeof candidate.endedAt === 'string' &&
    typeof candidate.distanceM === 'number' &&
    typeof candidate.durationS === 'number'
  )
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiState, setApiState] = useState<'connecting' | 'ok' | 'down'>('connecting')
  const [apiOverride, setApiOverrideState] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [units, setUnitsState] = useState<Units>('F')
  const [hapticsOn, setHapticsOnState] = useState(true)
  const [coords, setCoords] = useState<Coords>(DOWNTOWN)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('locating')
  const [locationNote, setLocationNote] = useState('Calibrating phone GPS')
  const [locationFixes, setLocationFixes] = useState(0)
  const [routingPreferences, setRoutingPreferencesState] = useState<RoutingPreferences>({
    avoidRedPaths: false,
    defaultProfile: 'cool',
  })
  const [activeWalk, setActiveWalk] = useState<ActiveWalk | null>(null)
  const [walkHistory, setWalkHistory] = useState<WalkRecord[]>([])
  const [places, setPlaces] = useState<Place[]>(FALLBACK_PLACES)
  const [hazards, setHazards] = useState<HazardFeature[]>([])
  const [dataNote, setDataNote] = useState('')

  const locRef = useRef<Coords>(DOWNTOWN)
  const watcherRef = useRef<Location.LocationSubscription | null>(null)
  const activeWalkRef = useRef<ActiveWalk | null>(null)
  const lastWalkPositionRef = useRef<Coords | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      watcherRef.current?.remove()
      watcherRef.current = null
    }
  }, [])

  const applyPosition = useCallback((position: Location.LocationObject) => {
    const next: Coords = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      heading: position.coords.heading,
      speed: position.coords.speed,
      ts: position.timestamp || Date.now(),
    }
    locRef.current = next
    if (!mountedRef.current) return next
    setCoords(next)
    setLocationStatus('live')
    setLocationFixes((count) => count + 1)
    const accuracyText = next.accuracy != null ? ` ±${Math.round(next.accuracy)} m` : ''
    setLocationNote(`GPS live${accuracyText}`)

    const active = activeWalkRef.current
    const prior = lastWalkPositionRef.current
    if (active && prior) {
      const displacement = haversineM(prior.lat, prior.lon, next.lat, next.lon)
      // Suppress stationary GPS noise and implausible jumps. This is a walk
      // tracker, not an odometer, so accepting a short clean sample is safer.
      const accurateEnough = (next.accuracy ?? 999) <= 80
      if (accurateEnough && displacement >= 2 && displacement <= 120) {
        const updated: ActiveWalk = {
          ...active,
          distanceM: active.distanceM + displacement,
          pointCount: active.pointCount + 1,
        }
        activeWalkRef.current = updated
        setActiveWalk(updated)
      }
    }
    if (active) lastWalkPositionRef.current = next
    return next
  }, [])

  const beginForegroundWatcher = useCallback(async () => {
    if (watcherRef.current) return
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 4,
        timeInterval: 2500,
      },
      applyPosition,
    )
    if (mountedRef.current) watcherRef.current = subscription
    else subscription.remove()
  }, [applyPosition])

  const acquireAccurateLocation = useCallback(async (): Promise<Coords | null> => {
    if (mountedRef.current) {
      setLocationStatus('calibrating')
      setLocationNote('Calibrating phone GPS')
    }
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) {
        if (mountedRef.current) {
          setLocationStatus('denied')
          setLocationNote('Location permission is off. Set a downtown start point or enable it in phone settings.')
        }
        return null
      }
      if (Platform.OS === 'android') {
        // This prompts for Android's high-accuracy network provider only when
        // it is available; refusing it still leaves ordinary GPS usable.
        await Location.enableNetworkProviderAsync().catch(() => {})
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      })
      const next = applyPosition(position)
      await beginForegroundWatcher()
      return next
    } catch {
      // If the watcher already delivered a real fix, retain it instead of
      // snapping a walker back to the downtown fallback.
      if (locRef.current.ts > 0) {
        if (mountedRef.current) {
          setLocationStatus('live')
          setLocationNote('Using the most recent GPS fix')
        }
        return locRef.current
      }
      if (mountedRef.current) {
        setLocationStatus('unavailable')
        setLocationNote('GPS is unavailable. Check your phone location settings or set a downtown start point.')
      }
      return null
    }
  }, [applyPosition, beginForegroundWatcher])

  const refreshLocation = useCallback(async () => {
    await acquireAccurateLocation()
  }, [acquireAccurateLocation])

  const useDowntown = useCallback(() => {
    locRef.current = DOWNTOWN
    setCoords(DOWNTOWN)
    setLocationStatus('fixed')
    setLocationNote('Downtown Austin map center selected')
  }, [])

  const buzz = useCallback(
    (style: 'light' | 'success' | 'warn' = 'light') => {
      if (!hapticsOn) return
      try {
        if (style === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        else if (style === 'warn') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      } catch {
        // Haptics are optional in Expo Go and on some phone hardware.
      }
    },
    [hapticsOn],
  )

  const loadData = useCallback(async () => {
    try {
      const [placeResponse, hazardResponse] = await Promise.all([api.places(), api.hazards()])
      if (Array.isArray(placeResponse?.places) && placeResponse.places.length) setPlaces(placeResponse.places)
      setHazards(Array.isArray(hazardResponse?.features) ? hazardResponse.features : [])
      setDataNote('')
    } catch (err) {
      setDataNote(friendlyError(err))
    }
  }, [])

  const retryConnection = useCallback(async () => {
    setApiState('connecting')
    const ok = await probe()
    setApiState(ok ? 'ok' : 'down')
    if (ok) await loadData()
  }, [loadData])

  // Restore before probing so a person's explicit address wins over the
  // transient Metro-manifest address on app relaunch.
  useEffect(() => {
    void (async () => {
      const [savedUrl, savedUnits, savedHaptics, savedPreferences, savedHistory] = await Promise.all([
        safeGet(STORAGE_KEYS.apiUrl),
        safeGet(STORAGE_KEYS.units),
        safeGet(STORAGE_KEYS.haptics),
        safeGet(STORAGE_KEYS.routingPreferences),
        safeGet(STORAGE_KEYS.walkHistory),
      ])
      if (savedUnits === 'C' || savedUnits === 'F') setUnitsState(savedUnits)
      if (savedHaptics != null) setHapticsOnState(savedHaptics !== '0')
      if (savedUrl) setApiOverrideState(savedUrl)
      setRoutingPreferencesState(parsePreferences(savedPreferences))
      setWalkHistory(parseWalkHistory(savedHistory))
      setBaseUrl(savedUrl || null)
      if (mountedRef.current) setHydrated(true)
    })()
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void (async () => {
      const base = apiOverride ? normalizeBaseUrl(apiOverride) : autoDetectApiUrl()
      setBaseUrl(apiOverride || null)
      setApiState('connecting')
      const ok = await probe(base)
      if (!mountedRef.current) return
      setApiState(ok ? 'ok' : 'down')
      if (ok) await loadData()
    })()
  }, [apiOverride, hydrated, loadData])

  const setApiOverride = useCallback((url: string | null) => {
    const value = url?.trim() ?? ''
    setBaseUrl(value || null)
    setApiOverrideState(value)
    void (async () => {
      try {
        if (value) await AsyncStorage.setItem(STORAGE_KEYS.apiUrl, value)
        else await AsyncStorage.removeItem(STORAGE_KEYS.apiUrl)
      } catch {
        // The address still applies for this session if storage is unavailable.
      }
    })()
  }, [])

  const setUnits = useCallback((value: Units) => {
    setUnitsState(value)
    void AsyncStorage.setItem(STORAGE_KEYS.units, value).catch(() => {})
  }, [])

  const setHapticsOn = useCallback((value: boolean) => {
    setHapticsOnState(value)
    void AsyncStorage.setItem(STORAGE_KEYS.haptics, value ? '1' : '0').catch(() => {})
  }, [])

  const persistPreferences = useCallback((next: RoutingPreferences) => {
    setRoutingPreferencesState(next)
    void AsyncStorage.setItem(STORAGE_KEYS.routingPreferences, JSON.stringify(next)).catch(() => {})
  }, [])

  const setAvoidRedPaths = useCallback(
    (value: boolean) => persistPreferences({ ...routingPreferences, avoidRedPaths: value }),
    [persistPreferences, routingPreferences],
  )

  const setDefaultProfile = useCallback(
    (profile: ProfileId) => persistPreferences({ ...routingPreferences, defaultProfile: profile }),
    [persistPreferences, routingPreferences],
  )

  const startWalk = useCallback(
    async (destination?: string): Promise<boolean> => {
      const start = await acquireAccurateLocation()
      if (!start) return false
      const next: ActiveWalk = {
        id: makeWalkId(),
        startedAt: new Date().toISOString(),
        startedLat: start.lat,
        startedLon: start.lon,
        distanceM: 0,
        pointCount: 1,
        destination,
      }
      activeWalkRef.current = next
      lastWalkPositionRef.current = start
      setActiveWalk(next)
      buzz('success')
      return true
    },
    [acquireAccurateLocation, buzz],
  )

  const stopWalk = useCallback(async (): Promise<WalkRecord | null> => {
    const active = activeWalkRef.current
    if (!active) return null
    const end = locRef.current
    const record: WalkRecord = {
      ...active,
      endedAt: new Date().toISOString(),
      durationS: Math.max(0, Math.round((Date.now() - new Date(active.startedAt).getTime()) / 1000)),
      endedLat: end.lat,
      endedLon: end.lon,
    }
    activeWalkRef.current = null
    lastWalkPositionRef.current = null
    setActiveWalk(null)
    setWalkHistory((prior) => {
      const next = [record, ...prior].slice(0, MAX_HISTORY)
      void AsyncStorage.setItem(STORAGE_KEYS.walkHistory, JSON.stringify(next)).catch(() => {})
      return next
    })
    buzz('success')
    return record
  }, [buzz])

  const clearWalkHistory = useCallback(() => {
    setWalkHistory([])
    void AsyncStorage.removeItem(STORAGE_KEYS.walkHistory).catch(() => {})
  }, [])

  useEffect(() => {
    void refreshLocation()
  }, [refreshLocation])

  // Refresh crowdsourced reports while the foreground map is running.
  useEffect(() => {
    if (apiState !== 'ok') return
    const interval = setInterval(() => void loadData(), 30_000)
    return () => clearInterval(interval)
  }, [apiState, loadData])

  const isWithinCoverage = isInCoverage(coords)
  const apiBase = apiOverride ? normalizeBaseUrl(apiOverride) : autoDetectApiUrl()

  const value = useMemo<AppState>(
    () => ({
      apiState,
      apiBase,
      apiOverride,
      setApiOverride,
      retryConnection,
      coords,
      locationStatus,
      locationNote,
      locationFixes,
      isWithinCoverage,
      coverageNote: coverageMessage(coords),
      refreshLocation,
      calibrateGps: refreshLocation,
      useDowntown,
      routingPreferences,
      setAvoidRedPaths,
      setDefaultProfile,
      activeWalk,
      walkHistory,
      startWalk,
      stopWalk,
      clearWalkHistory,
      units,
      setUnits,
      hapticsOn,
      setHapticsOn,
      places,
      hazards,
      dataNote,
      refreshData: loadData,
      buzz,
    }),
    [
      apiState,
      apiBase,
      apiOverride,
      setApiOverride,
      retryConnection,
      coords,
      locationStatus,
      locationNote,
      locationFixes,
      isWithinCoverage,
      refreshLocation,
      useDowntown,
      routingPreferences,
      setAvoidRedPaths,
      setDefaultProfile,
      activeWalk,
      walkHistory,
      startWalk,
      stopWalk,
      clearWalkHistory,
      units,
      setUnits,
      hapticsOn,
      setHapticsOn,
      places,
      hazards,
      dataNote,
      loadData,
      buzz,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
