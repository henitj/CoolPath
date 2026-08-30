import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView, { type LayerToggles } from './components/MapView'
import RoutingPanel from './components/RoutingPanel'
import MetricsPanel from './components/MetricsPanel'
import HazardDrawer from './components/HazardDrawer'
import LayerTogglesBar from './components/LayerToggles'
import TimeSlider from './components/TimeSlider'
import StatusBar from './components/StatusBar'
import Legend from './components/Legend'
import { api, bboxAround } from './api/client'
import { useHazards } from './hooks/useHazards'
import { useRoute } from './hooks/useRoute'
import { useShadows } from './hooks/useShadows'
import { useSatelliteStatus } from './hooks/useSatelliteStatus'
import { useGeolocation } from './hooks/useGeolocation'
import { austinTodayAt } from './utils/time'
import type { FeatureCollection, ProfileId } from './types'

type PickMode = 'origin' | 'destination' | 'hazard' | null

const DEFAULT_LAYERS: LayerToggles = {
  heat: true,
  canopy: true,
  buildings: true,
  shadows: true,
  hazards: true,
}

export default function App() {
  const [layersData, setLayersData] = useState<{
    heat: FeatureCollection | null
    canopy: FeatureCollection | null
    buildings: FeatureCollection | null
    water: FeatureCollection | null
    parks: FeatureCollection | null
  }>({ heat: null, canopy: null, buildings: null, water: null, parks: null })

  const [profile, setProfile] = useState<ProfileId>('cool')
  const [origin, setOrigin] = useState<[number, number] | null>([-97.747, 30.2653])
  const [destination, setDestination] = useState<[number, number] | null>([-97.7355, 30.2725])
  const [pickMode, setPickMode] = useState<PickMode>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  const [layerToggles, setLayerToggles] = useState<LayerToggles>(DEFAULT_LAYERS)
  const [hour, setHour] = useState<number>(() => {
    const chicagoHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })
        .format(new Date()),
    ) % 24
    return chicagoHour
  })
  const [isNow, setIsNow] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hazardPin, setHazardPin] = useState<[number, number] | null>(null)

  const hazards = useHazards()
  const routing = useRoute()
  const status = useSatelliteStatus()
  const geo = useGeolocation()

  const shadowTimestamp = useMemo(
    () => (isNow ? undefined : austinTodayAt(hour)),
    [isNow, hour],
  )
  const { shadows } = useShadows(shadowTimestamp)

  useEffect(() => {
    void (async () => {
      try {
        const [heat, canopy, buildings, water, parks] = await Promise.all([
          api.layer('heat'),
          api.layer('canopy'),
          api.layer('buildings'),
          api.layer('water'),
          api.layer('parks'),
        ])
        setLayersData({ heat, canopy, buildings, water, parks })
      } catch (e) {
        console.error('failed to load layers', e)
      }
    })()
  }, [])

  const onMapClick = useCallback(
    (coord: [number, number]) => {
      if (pickMode === 'hazard') {
        setHazardPin(coord)
        setPickMode(null)
        return
      }
      if (pickMode === 'origin') {
        setOrigin(coord)
        setPickMode(null)
        return
      }
      if (pickMode === 'destination') {
        setDestination(coord)
        setPickMode(null)
        return
      }
      // default: walk through origin -> destination -> restart
      if (origin === null || (origin !== null && destination !== null)) {
        setOrigin(coord)
        setDestination(null)
      } else {
        setDestination(coord)
      }
    },
    [pickMode, origin, destination],
  )

  const go = useCallback(async () => {
    if (!origin || !destination) return
    setRouteError(null)
    const result = await routing.fetchRoute({ origin, destination, profile })
    if (!result) {
      // error surfaced via hook; fetchRoute already set it
    }
  }, [origin, destination, profile, routing])

  // auto-route on profile change if we already have both points
  useEffect(() => {
    if (origin && destination) void go()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const submitHazard = useCallback(
    async (payload: { category: string; severity: number; note: string; lat: number; lon: number }) => {
      try {
        await api.createHazard({ ...payload, reporter: 'web' })
        await hazards.refresh()
        return null
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    [hazards],
  )

  const locateForHazard = useCallback(() => {
    geo.locate()
    const started = Date.now()
    const iv = setInterval(() => {
      if (geo.coords) {
        setHazardPin(geo.coords)
        clearInterval(iv)
      } else if (Date.now() - started > 9000) clearInterval(iv)
    }, 250)
  }, [geo])

  const bbox = bboxAround(-97.7431, 30.2672, 0.03)
  const visibleHazards = useMemo(
    () =>
      hazards.hazards.filter((h) => {
        const [lon, lat] = h.geometry.coordinates
        return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]
      }),
    [hazards.hazards, bbox],
  )

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView
        heat={layersData.heat}
        canopy={layersData.canopy}
        buildings={layersData.buildings}
        water={layersData.water}
        parks={layersData.parks}
        shadows={shadows}
        hazards={visibleHazards}
        route={routing.route}
        layers={layerToggles}
        origin={origin}
        destination={destination}
        pickMode={pickMode === 'origin' || pickMode === 'destination' ? pickMode : null}
        onMapClick={onMapClick}
      />

      {/* header */}
      <header className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-3">
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="panel flex items-center gap-2 px-3 py-2">
            <span className="text-xl">🌡️</span>
            <div>
              <h1 className="text-sm font-black leading-tight tracking-wide text-slate-100">
                COOL<span className="text-cyan-400">PATH</span>
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">
                Austin micro-climate & walkability
              </p>
            </div>
          </div>
          <div className="pointer-events-auto">
            <StatusBar status={status.status} refreshing={status.refreshing} onRefresh={status.triggerRefresh} />
          </div>
        </div>
      </header>

      {/* left sidebar */}
      <aside className="scroll-thin absolute left-3 top-[120px] z-10 flex max-h-[calc(100vh-150px)] w-[340px] flex-col gap-2 overflow-y-auto pb-2">
        <RoutingPanel
          profile={profile}
          onProfile={setProfile}
          origin={origin}
          destination={destination}
          pickMode={pickMode === 'origin' || pickMode === 'destination' ? pickMode : null}
          onPick={(which) => setPickMode(which)}
          onSetCoord={(which, coord) => (which === 'origin' ? setOrigin(coord) : setDestination(coord))}
          onSwap={() => {
            setOrigin(destination)
            setDestination(origin)
          }}
          onGo={go}
          onClear={() => {
            setOrigin(null)
            setDestination(null)
            routing.clear()
          }}
          loading={routing.loading}
          error={routing.error ?? routeError}
          canRoute={Boolean(origin && destination)}
        />
        <MetricsPanel route={routing.route} />
      </aside>

      {/* bottom control bar */}
      <footer className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
        <div className="panel px-3 py-2">
          <TimeSlider
            hour={hour}
            onHour={(h) => {
              setHour(h)
              setIsNow(false)
            }}
            onNow={() => setIsNow(true)}
            isNow={isNow}
          />
        </div>
        <div className="panel px-3 py-2">
          <LayerTogglesBar
            layers={layerToggles}
            onToggle={(key) => setLayerToggles((t) => ({ ...t, [key]: !t[key] }))}
          />
        </div>
        <Legend />
      </footer>

      {/* hazard FAB */}
      {!drawerOpen && (
        <button
          className="absolute bottom-20 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-2xl text-slate-950 shadow-panel transition-transform hover:scale-105"
          title="Report a hazard"
          onClick={() => {
            setDrawerOpen(true)
            if (!hazardPin) setPickMode('hazard')
          }}
        >
          ⚠️
        </button>
      )}

      <HazardDrawer
        open={drawerOpen}
        categories={HAZARD_CATEGORIES_FALLBACK}
        pin={hazardPin}
        pickMode={pickMode === 'hazard'}
        onPickPin={() => setPickMode(pickMode === 'hazard' ? null : 'hazard')}
        onLocate={locateForHazard}
        onSubmit={submitHazard}
        onClose={() => {
          setDrawerOpen(false)
          setPickMode(null)
        }}
      />
    </div>
  )
}

// Static fallback list (kept in sync with the backend taxonomy).
const HAZARD_CATEGORIES_FALLBACK = [
  { id: 'broken_sidewalk', label: 'Broken Sidewalk', color: '#f97316', weight: 0.6 },
  { id: 'extreme_sun', label: 'No Shade / Extreme Sun', color: '#facc15', weight: 0.5 },
  { id: 'unlit_area', label: 'Unlit Area', color: '#a78bfa', weight: 0.55 },
  { id: 'construction', label: 'Construction', color: '#60a5fa', weight: 0.7 },
  { id: 'blocked_path', label: 'Blocked Path', color: '#f472b6', weight: 0.8 },
  { id: 'flooding', label: 'Flooding / Standing Water', color: '#22d3ee', weight: 0.85 },
  { id: 'other', label: 'Other', color: '#94a3b8', weight: 0.4 },
]
