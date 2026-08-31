/**
 * Global app state: settings (persisted), location, hazards, connection.
 * Every effect is defensive — the app must never crash, whatever the
 * backend, permissions or network throw at it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { api, friendlyError, probe, setBaseUrl } from './api'
import { STORAGE_KEYS, autoDetectApiUrl } from './config'
import { FALLBACK_PLACES } from './places'
import type { HazardFeature, Place, Units } from './types'

export interface Coords {
  lat: number
  lon: number
  accuracy?: number
  ts: number
}

const DOWNTOWN: Coords = { lat: 30.2672, lon: -97.7431, ts: 0 }

interface AppState {
  // connection
  apiState: 'connecting' | 'ok' | 'down'
  apiBase: string
  apiOverride: string
  setApiOverride: (url: string | null) => void
  retryConnection: () => Promise<void>
  // location
  coords: Coords
  locationStatus: 'locating' | 'live' | 'fixed' | 'denied'
  locationNote: string
  refreshLocation: () => Promise<void>
  useDowntown: () => void
  // settings
  units: Units
  setUnits: (u: Units) => void
  hapticsOn: boolean
  setHapticsOn: (v: boolean) => void
  // data
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

async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key)
  } catch {
    return null
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiState, setApiState] = useState<'connecting' | 'ok' | 'down'>('connecting')
  const [apiOverride, setApiOverrideState] = useState<string>('')
  const [units, setUnitsState] = useState<Units>('F')
  const [hapticsOn, setHapticsOnState] = useState(true)
  const [coords, setCoords] = useState<Coords>(DOWNTOWN)
  const [locationStatus, setLocationStatus] = useState<AppState['locationStatus']>('locating')
  const [locationNote, setLocationNote] = useState('Finding you…')
  const [places, setPlaces] = useState<Place[]>(FALLBACK_PLACES)
  const [hazards, setHazards] = useState<HazardFeature[]>([])
  const [dataNote, setDataNote] = useState('')

  const locRef = useRef<Coords>(DOWNTOWN)

  const buzz = useCallback(
    (style: 'light' | 'success' | 'warn' = 'light') => {
      if (!hapticsOn) return
      try {
        if (style === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        else if (style === 'warn') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      } catch {
        /* haptics unsupported — silently fine */
      }
    },
    [hapticsOn],
  )

  // ---------- restore persisted settings ----------
  useEffect(() => {
    void (async () => {
      const [savedUrl, savedUnits, savedHaptics] = await Promise.all([
        safeGet(STORAGE_KEYS.apiUrl),
        safeGet(STORAGE_KEYS.units),
        safeGet(STORAGE_KEYS.haptics),
      ])
      if (savedUnits === 'C' || savedUnits === 'F') setUnitsState(savedUnits)
      if (savedHaptics != null) setHapticsOnState(savedHaptics !== '0')
      if (savedUrl) setApiOverrideState(savedUrl)
      setBaseUrl(savedUrl || null)
    })()
  }, [])

  // ---------- connection probe + data load ----------
  const loadData = useCallback(async () => {
    try {
      const [pl, hz] = await Promise.all([api.places(), api.hazards()])
      if (Array.isArray(pl?.places) && pl.places.length) setPlaces(pl.places)
      setHazards(Array.isArray(hz?.features) ? hz.features : [])
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

  useEffect(() => {
    void (async () => {
      const base = apiOverride || autoDetectApiUrl()
      setBaseUrl(apiOverride || null)
      const ok = await probe(base)
      setApiState(ok ? 'ok' : 'down')
      if (ok) await loadData()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiOverride])

  const setApiOverride = useCallback((url: string | null) => {
    const v = url ?? ''
    setApiOverrideState(v)
    void (async () => {
      try {
        if (v) await AsyncStorage.setItem(STORAGE_KEYS.apiUrl, v)
        else await AsyncStorage.removeItem(STORAGE_KEYS.apiUrl)
      } catch {
        /* storage full/unavailable — setting still applies for this session */
      }
    })()
  }, [])

  const setUnits = useCallback((u: Units) => {
    setUnitsState(u)
    void AsyncStorage.setItem(STORAGE_KEYS.units, u).catch(() => {})
  }, [])

  const setHapticsOn = useCallback((v: boolean) => {
    setHapticsOnState(v)
    void AsyncStorage.setItem(STORAGE_KEYS.haptics, v ? '1' : '0').catch(() => {})
  }, [])

  // ---------- location ----------
  const refreshLocation = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync()
      if (!perm.granted) {
        setLocationStatus('denied')
        setLocationNote('Location off — using Downtown Austin')
        return
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const c: Coords = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        ts: Date.now(),
      }
      locRef.current = c
      setCoords(c)
      setLocationStatus('live')
      setLocationNote('Live location')
    } catch {
      setLocationStatus('fixed')
      setLocationNote('Location unavailable — using Downtown Austin')
    }
  }, [])

  const useDowntown = useCallback(() => {
    setCoords(DOWNTOWN)
    setLocationStatus('fixed')
    setLocationNote('Anchored to Downtown Austin')
  }, [])

  useEffect(() => {
    void refreshLocation()
  }, [refreshLocation])

  // periodic hazard refresh (crowdsourced layer stays warm)
  useEffect(() => {
    if (apiState !== 'ok') return
    const iv = setInterval(() => {
      void loadData()
    }, 30000)
    return () => clearInterval(iv)
  }, [apiState, loadData])

  const value = useMemo<AppState>(
    () => ({
      apiState,
      apiBase: apiOverride || autoDetectApiUrl(),
      apiOverride,
      setApiOverride,
      retryConnection,
      coords,
      locationStatus,
      locationNote,
      refreshLocation,
      useDowntown,
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
      apiState, apiOverride, retryConnection, coords, locationStatus, locationNote,
      refreshLocation, useDowntown, units, setUnits, hapticsOn, setHapticsOn,
      places, hazards, dataNote, loadData, buzz, setApiOverride,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
