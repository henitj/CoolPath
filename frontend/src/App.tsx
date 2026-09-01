import { useCallback, useEffect, useRef, useState } from 'react'
import MapView, { type LayerToggles } from './components/MapView'
import DirectionsPanel, { type RouteField } from './components/DirectionsPanel'
import RouteSummary from './components/RouteSummary'
import HazardDrawer from './components/HazardDrawer'
import { api } from './api/client'
import { HAZARD_CATEGORIES } from './constants'
import { useGeolocation } from './hooks/useGeolocation'
import { useHazards } from './hooks/useHazards'
import { useRoadConditions } from './hooks/useRoadConditions'
import { useRoute } from './hooks/useRoute'
import { useShadows } from './hooks/useShadows'
import type { FeatureCollection, MapLocation, MetaResponse, Place, ProfileId } from './types'

type PickMode = RouteField | 'hazard' | null

const DEFAULT_META: MetaResponse = {
  name: 'CoolPath',
  tagline: 'Micro-climate & walkability routing for Downtown Austin',
  version: '1.0.0',
  bbox: [-97.755, 30.260, -97.730, 30.278],
  center: { lat: 30.2672, lon: -97.7431 },
  timezone: 'America/Chicago',
}

const DEFAULT_LAYERS: LayerToggles = {
  conditions: true,
  heat: true,
  canopy: false,
  buildings: false,
  shadows: false,
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
  const [meta, setMeta] = useState<MetaResponse>(DEFAULT_META)
  const [places, setPlaces] = useState<Place[]>([])
  const [origin, setOrigin] = useState<MapLocation | null>(null)
  const [destination, setDestination] = useState<MapLocation | null>(null)
  const [profile, setProfile] = useState<ProfileId>('cool')
  const [pickMode, setPickMode] = useState<PickMode>(null)
  const [hazardDrawerOpen, setHazardDrawerOpen] = useState(false)
  const [hazardPin, setHazardPin] = useState<[number, number] | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [focusLocation, setFocusLocation] = useState<[number, number] | null>(null)
  const [layers, setLayers] = useState<LayerToggles>(DEFAULT_LAYERS)
  const [showLayers, setShowLayers] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [plannerKey, setPlannerKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)

  const geo = useGeolocation()
  const hazards = useHazards()
  const roadConditions = useRoadConditions()
  const routing = useRoute()
  const { shadows } = useShadows(undefined)
  const routeRequestRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const [layersResult, placesResult, metaResult] = await Promise.allSettled([
        Promise.all([
          api.layer('heat'),
          api.layer('canopy'),
          api.layer('buildings'),
          api.layer('water'),
          api.layer('parks'),
        ]),
        api.places(),
        api.meta(),
      ])
      if (!active) return

      if (layersResult.status === 'fulfilled') {
        const [heat, canopy, buildings, water, parks] = layersResult.value
        setLayersData({ heat, canopy, buildings, water, parks })
      } else {
        setDataError('The map is loading without its local climate layers. Check the CoolPath API connection.')
      }
      if (placesResult.status === 'fulfilled') setPlaces(placesResult.value.places)
      if (metaResult.status === 'fulfilled') setMeta(metaResult.value)
    })()
    return () => {
      active = false
    }
  }, [])

  const withinCoverage = useCallback((coord: [number, number]) => {
    const [minLon, minLat, maxLon, maxLat] = meta.bbox
    const [lon, lat] = coord
    // Matches the small edge tolerance accepted by the route and hazard APIs.
    const pad = 0.006
    return lon >= minLon - pad && lon <= maxLon + pad && lat >= minLat - pad && lat <= maxLat + pad
  }, [meta.bbox])

  const clearRoute = useCallback(() => {
    routing.clear()
    routeRequestRef.current = null
  }, [routing])

  const selectLocation = useCallback((field: RouteField, location: MapLocation) => {
    if (!withinCoverage(location.coordinates)) {
      setNotice('CoolPath can score routes inside Downtown Austin right now. Pick a point in the downtown map area.')
      return
    }
    if (field === 'origin') setOrigin(location)
    else setDestination(location)
    setFocusLocation(location.coordinates)
    setPickMode(null)
    setNotice(null)
    clearRoute()
  }, [clearRoute, withinCoverage])

  const calculateRoute = useCallback(async () => {
    if (!origin || !destination) return null
    return routing.fetchRoute({
      origin: origin.coordinates,
      destination: destination.coordinates,
      profile,
      include_baseline: true,
    })
  }, [destination, origin, profile, routing])

  // Selecting two stops or changing the preference immediately refreshes the
  // recommendation. The button remains available as an explicit retry.
  useEffect(() => {
    if (!origin || !destination) return
    const requestKey = `${origin.id}:${origin.coordinates.join(',')}|${destination.id}:${destination.coordinates.join(',')}|${profile}`
    if (routeRequestRef.current === requestKey) return
    routeRequestRef.current = requestKey
    void calculateRoute()
  }, [calculateRoute, destination, origin, profile])

  const locateForRoute = useCallback(async (field: RouteField) => {
    const coords = await geo.locate()
    if (!coords) {
      setNotice('We could not get your location. Check browser permission, or choose a point on the map.')
      return
    }
    setUserLocation(coords)
    if (!withinCoverage(coords)) {
      setNotice('Your current location is outside CoolPath’s Downtown Austin coverage. You can still search or drop pins inside the map.')
      return
    }
    selectLocation(field, {
      id: `location-${coords[0].toFixed(6)}-${coords[1].toFixed(6)}`,
      name: 'Your current location',
      coordinates: coords,
      detail: geo.accuracy ? `GPS accurate to about ${Math.round(geo.accuracy)} m` : 'Device location',
      source: 'location',
    })
  }, [geo, selectLocation, withinCoverage])

  const locateHazard = useCallback(async () => {
    const coords = await geo.locate()
    if (!coords) {
      setNotice('We could not get your location. Drop a pin on the map instead.')
      return
    }
    setUserLocation(coords)
    if (!withinCoverage(coords)) {
      setNotice('Hazard reports are currently limited to Downtown Austin. Choose a location on the map.')
      return
    }
    setHazardPin(coords)
    setFocusLocation(coords)
    setPickMode(null)
  }, [geo, withinCoverage])

  const onMapClick = useCallback((coord: [number, number]) => {
    if (!withinCoverage(coord)) {
      setNotice('CoolPath’s live road scores currently cover Downtown Austin. Please choose a point inside the map area.')
      return
    }
    if (pickMode === 'hazard') {
      setHazardPin(coord)
      setPickMode(null)
      return
    }
    const field: RouteField = pickMode ?? (origin ? 'destination' : 'origin')
    selectLocation(field, {
      id: `pin-${coord[0].toFixed(6)}-${coord[1].toFixed(6)}`,
      name: `Map pin (${coord[1].toFixed(4)}, ${coord[0].toFixed(4)})`,
      coordinates: coord,
      detail: 'Selected from the map',
      source: 'map',
    })
  }, [origin, pickMode, selectLocation, withinCoverage])

  const submitHazard = useCallback(async (payload: {
    category: string
    severity: number
    note: string
    lat: number
    lon: number
  }) => {
    try {
      await api.createHazard({ ...payload, reporter: 'web-map' })
      await Promise.all([hazards.refresh(), roadConditions.refresh()])
      void calculateRoute()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not send this report. Please try again.'
    }
  }, [calculateRoute, hazards, roadConditions])

  const toggleLayer = (key: keyof LayerToggles) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }))
  }

  const roadStatus = roadConditions.updatedAt
    ? `Road conditions updated ${formatUpdatedAt(roadConditions.updatedAt)}`
    : 'Loading live road conditions…'

  return (
    <main className={`map-app ${routing.route ? 'has-route' : ''}`}>
      <MapView
        heat={layersData.heat}
        canopy={layersData.canopy}
        buildings={layersData.buildings}
        water={layersData.water}
        parks={layersData.parks}
        shadows={shadows}
        conditions={roadConditions.conditions}
        hazards={hazards.hazards}
        route={routing.route}
        layers={layers}
        origin={origin}
        destination={destination}
        userLocation={userLocation}
        hazardPin={hazardPin}
        focusLocation={focusLocation}
        pickMode={pickMode}
        onMapClick={onMapClick}
      />

      <DirectionsPanel
        key={plannerKey}
        origin={origin}
        destination={destination}
        places={places}
        profile={profile}
        pickMode={pickMode === 'origin' || pickMode === 'destination' ? pickMode : null}
        locating={geo.loading}
        loading={routing.loading}
        error={routing.error}
        onSelect={selectLocation}
        onPickOnMap={(field) => setPickMode(field)}
        onClearField={(field) => {
          if (field === 'origin') setOrigin(null)
          else setDestination(null)
          clearRoute()
        }}
        onUseLocation={(field) => void locateForRoute(field)}
        onProfile={setProfile}
        onSwap={() => {
          setOrigin(destination)
          setDestination(origin)
          clearRoute()
        }}
        onClear={() => {
          setOrigin(null)
          setDestination(null)
          setPickMode(null)
          setPlannerKey((current) => current + 1)
          clearRoute()
        }}
        onRoute={() => void calculateRoute()}
      />

      <div className="map-status" aria-live="polite">
        <span className={`status-dot ${roadConditions.conditions ? 'ready' : ''}`} />
        {roadStatus}
      </div>

      {(notice || dataError || roadConditions.error) && (
        <div className="map-notice" role="status">
          <span>ⓘ</span>
          <p>{notice ?? dataError ?? 'Live road colours are unavailable until the API responds.'}</p>
          <button type="button" aria-label="Dismiss notice" onClick={() => {
            setNotice(null)
            setDataError(null)
          }}>×</button>
        </div>
      )}

      <div className="map-tools" aria-label="Map controls">
        <button className="map-tool-button locate-tool" type="button" title="Use my location" onClick={() => void locateForRoute('origin')}>
          <span>◎</span><span className="tool-label">Locate me</span>
        </button>
        <div className="layers-control">
          <button className="map-tool-button" type="button" aria-expanded={showLayers} onClick={() => setShowLayers((show) => !show)}>
            <span>▤</span><span className="tool-label">Layers</span>
          </button>
          {showLayers && (
            <div className="layers-menu">
              <b>Map layers</b>
              {([
                ['conditions', 'Road conditions'],
                ['heat', 'Heat zones'],
                ['canopy', 'Tree canopy'],
                ['shadows', 'Building shade'],
                ['buildings', 'Buildings'],
                ['hazards', 'Reported hazards'],
              ] as [keyof LayerToggles, string][]).map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className={`condition-legend ${showLegend ? '' : 'is-collapsed'}`}>
        <button type="button" className="legend-title" onClick={() => setShowLegend((show) => !show)} aria-expanded={showLegend}>
          <span className="legend-swatch" />
          <span>Walking conditions</span>
          <span className="legend-chevron">⌃</span>
        </button>
        {showLegend && (
          <div className="legend-content">
            <p>Live heat, shade, accessibility, and hazard score</p>
            <div className="condition-scale"><span>Poor</span><i /><i /><i /><span>Great</span></div>
            <div className="condition-colors"><i /><i /><i /><i /></div>
          </div>
        )}
      </aside>

      <RouteSummary route={routing.route} onClose={routing.clear} />

      {!hazardDrawerOpen && (
        <button className="hazard-fab" type="button" onClick={() => {
          setHazardDrawerOpen(true)
          setPickMode(null)
        }}>
          <span className="hazard-fab-icon">!</span>
          <span>Report hazard</span>
        </button>
      )}
      <HazardDrawer
        open={hazardDrawerOpen}
        categories={HAZARD_CATEGORIES}
        pin={hazardPin}
        pickMode={pickMode === 'hazard'}
        locating={geo.loading}
        onPickPin={() => setPickMode((current) => current === 'hazard' ? null : 'hazard')}
        onLocate={() => void locateHazard()}
        onSubmit={submitHazard}
        onClose={() => {
          setHazardDrawerOpen(false)
          setPickMode(null)
        }}
      />
    </main>
  )
}

function formatUpdatedAt(updatedAt: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}
