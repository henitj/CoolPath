import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type {
  FeatureCollection,
  HazardFeature,
  MapLocation,
  RoadConditionsResponse,
  RouteResponse,
  ShadowResponse,
} from '../types'

export interface LayerToggles {
  conditions: boolean
  heat: boolean
  canopy: boolean
  buildings: boolean
  shadows: boolean
  hazards: boolean
}

type PickMode = 'origin' | 'destination' | 'hazard' | null

interface MapViewProps {
  heat: FeatureCollection | null
  canopy: FeatureCollection | null
  buildings: FeatureCollection | null
  water: FeatureCollection | null
  parks: FeatureCollection | null
  shadows: ShadowResponse | null
  conditions: RoadConditionsResponse | null
  hazards: HazardFeature[]
  route: RouteResponse | null
  layers: LayerToggles
  origin: MapLocation | null
  destination: MapLocation | null
  userLocation: [number, number] | null
  hazardPin: [number, number] | null
  focusLocation: [number, number] | null
  pickMode: PickMode
  onMapClick: (coord: [number, number]) => void
}

const AUSTIN_CENTER: [number, number] = [-97.7431, 30.2672]
const EMPTY_FEATURES: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** A no-key basemap with the familiar, clean street-map visual language. */
const BASE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 20,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    { id: 'canvas', type: 'background', paint: { 'background-color': '#f6f8f4' } },
    { id: 'basemap', type: 'raster', source: 'basemap' },
  ],
}

function setSourceData(map: MapLibreMap, id: string, data: unknown) {
  const source = map.getSource(id) as GeoJSONSource | undefined
  if (source) source.setData(data as never)
}

function addLayerIfMissing(map: MapLibreMap, layer: LayerSpecification) {
  if (!map.getLayer(layer.id)) map.addLayer(layer)
}

function addDataSources(map: MapLibreMap) {
  for (const id of [
    'parks-src',
    'water-src',
    'heat-src',
    'buildings-src',
    'canopy-src',
    'shadow-src',
    'conditions-src',
    'hazards-src',
    'route-src',
    'route-baseline-src',
  ]) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY_FEATURES as never })
  }
}

function addDataLayers(map: MapLibreMap) {
  // Render order is intentional: soft condition zones first, clear road
  // strokes next, then the chosen route and reports above everything else.
  addLayerIfMissing(map, {
    id: 'parks-fill',
    type: 'fill',
    source: 'parks-src',
    paint: { 'fill-color': '#86efac', 'fill-opacity': 0.22 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'water-fill',
    type: 'fill',
    source: 'water-src',
    paint: { 'fill-color': '#8bd3e8', 'fill-opacity': 0.58 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'heat-fill',
    type: 'fill',
    source: 'heat-src',
    paint: {
      'fill-color': [
        'interpolate',
        ['linear'],
        ['get', 'warmth'],
        0, '#22c55e',
        0.32, '#a3e635',
        0.55, '#facc15',
        0.75, '#fb923c',
        1, '#ef4444',
      ],
      'fill-opacity': 0.24,
    },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'buildings-fill',
    type: 'fill',
    source: 'buildings-src',
    paint: { 'fill-color': '#9ca3af', 'fill-opacity': 0.24 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'canopy-fill',
    type: 'fill',
    source: 'canopy-src',
    paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.28 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'shadow-fill',
    type: 'fill',
    source: 'shadow-src',
    paint: { 'fill-color': '#334155', 'fill-opacity': 0.2 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'condition-road-casing',
    type: 'line',
    source: 'conditions-src',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 5.6, 'line-opacity': 0.78 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'condition-road-line',
    type: 'line',
    source: 'conditions-src',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#65a30d'],
      'line-width': 3.4,
      'line-opacity': 0.9,
    },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'route-baseline-line',
    type: 'line',
    source: 'route-baseline-src',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#64748b', 'line-width': 3, 'line-dasharray': [1.3, 1.8], 'line-opacity': 0.9 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'route-casing-line',
    type: 'line',
    source: 'route-src',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 8.5, 'line-opacity': 0.92 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'route-line',
    type: 'line',
    source: 'route-src',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['coalesce', ['get', 'color'], '#0284c7'], 'line-width': 5 },
  } as LayerSpecification)
  addLayerIfMissing(map, {
    id: 'hazard-circle',
    type: 'circle',
    source: 'hazards-src',
    paint: {
      'circle-color': ['coalesce', ['get', 'color'], '#ea580c'],
      'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 1, 5, 5, 10],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.98,
    },
  } as LayerSpecification)
}

function setVisibility(map: MapLibreMap, id: string, visible: boolean) {
  if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}

function markerElement(kind: 'origin' | 'destination' | 'user' | 'hazard'): HTMLElement {
  const element = document.createElement('div')
  element.className = `map-marker map-marker-${kind}`
  element.setAttribute('aria-hidden', 'true')
  if (kind === 'origin') element.innerHTML = '<span>●</span>'
  else if (kind === 'destination') element.innerHTML = '<span>◆</span>'
  else if (kind === 'hazard') element.innerHTML = '<span>!</span>'
  return element
}

function updateMarker(
  map: MapLibreMap,
  ref: MutableRefObject<maplibregl.Marker | null>,
  coord: [number, number] | null,
  kind: 'origin' | 'destination' | 'user' | 'hazard',
  label: string,
) {
  ref.current?.remove()
  ref.current = null
  if (!coord) return
  const marker = new maplibregl.Marker({ element: markerElement(kind), anchor: 'bottom' })
  marker.setPopup(new maplibregl.Popup({ offset: 17, closeButton: false }).setText(label))
  ref.current = marker.setLngLat(coord).addTo(map)
}

export default function MapView({
  heat,
  canopy,
  buildings,
  water,
  parks,
  shadows,
  conditions,
  hazards,
  route,
  layers,
  origin,
  destination,
  userLocation,
  hazardPin,
  focusLocation,
  pickMode,
  onMapClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const originMarker = useRef<maplibregl.Marker | null>(null)
  const destinationMarker = useRef<maplibregl.Marker | null>(null)
  const userMarker = useRef<maplibregl.Marker | null>(null)
  const hazardMarker = useRef<maplibregl.Marker | null>(null)
  const onClickRef = useRef(onMapClick)
  const previousRouteRef = useRef<string | null>(null)
  const previousFocusRef = useRef<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    onClickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let isMounted = true
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: AUSTIN_CENTER,
      zoom: 14.4,
      minZoom: 11,
      maxZoom: 19,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial', maxWidth: 90 }), 'bottom-right')

    map.on('load', () => {
      if (!isMounted) return
      // Sources must exist before layers reference them. This is what makes
      // first-load rendering deterministic instead of silently failing.
      addDataSources(map)
      addDataLayers(map)
      setMapReady(true)
    })
    map.on('click', (event) => {
      onClickRef.current([
        Number(event.lngLat.lng.toFixed(6)),
        Number(event.lngLat.lat.toFixed(6)),
      ])
    })

    return () => {
      isMounted = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    setSourceData(map, 'heat-src', heat ?? EMPTY_FEATURES)
    setSourceData(map, 'canopy-src', canopy ?? EMPTY_FEATURES)
    setSourceData(map, 'buildings-src', buildings ?? EMPTY_FEATURES)
    setSourceData(map, 'water-src', water ?? EMPTY_FEATURES)
    setSourceData(map, 'parks-src', parks ?? EMPTY_FEATURES)
    setSourceData(map, 'conditions-src', conditions ?? EMPTY_FEATURES)
    setSourceData(map, 'hazards-src', { type: 'FeatureCollection', features: hazards })
    setSourceData(map, 'route-src', route ? { type: 'FeatureCollection', features: [route] } : EMPTY_FEATURES)
    setSourceData(map, 'route-baseline-src', route?.baseline ? { type: 'FeatureCollection', features: [route.baseline] } : EMPTY_FEATURES)

    const shadowCollection = shadows?.geometry
      ? {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: shadows.properties, geometry: shadows.geometry }],
        }
      : EMPTY_FEATURES
    setSourceData(map, 'shadow-src', shadowCollection)

    setVisibility(map, 'heat-fill', layers.heat)
    setVisibility(map, 'canopy-fill', layers.canopy)
    setVisibility(map, 'buildings-fill', layers.buildings)
    setVisibility(map, 'shadow-fill', layers.shadows)
    setVisibility(map, 'condition-road-casing', layers.conditions)
    setVisibility(map, 'condition-road-line', layers.conditions)
    setVisibility(map, 'hazard-circle', layers.hazards)
    setVisibility(map, 'route-line', Boolean(route))
    setVisibility(map, 'route-casing-line', Boolean(route))
    setVisibility(map, 'route-baseline-line', Boolean(route?.baseline))
  }, [mapReady, heat, canopy, buildings, water, parks, shadows, conditions, hazards, route, layers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    updateMarker(map, originMarker, origin?.coordinates ?? null, 'origin', origin?.name ?? 'Start')
    updateMarker(map, destinationMarker, destination?.coordinates ?? null, 'destination', destination?.name ?? 'Destination')
    updateMarker(map, userMarker, userLocation, 'user', 'Your current location')
    updateMarker(map, hazardMarker, hazardPin, 'hazard', 'Hazard report location')
  }, [mapReady, origin, destination, userLocation, hazardPin])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !route) return
    const coords = route.geometry.coordinates
    if (coords.length < 2) return
    const routeKey = `${route.properties.profile}:${coords.length}:${coords[0].join(',')}:${coords.at(-1)?.join(',')}`
    if (previousRouteRef.current === routeKey) return
    previousRouteRef.current = routeKey
    const lons = coords.map(([lon]) => lon)
    const lats = coords.map(([, lat]) => lat)
    const compact = window.innerWidth <= 760
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        padding: compact
          ? { top: 225, bottom: 210, left: 26, right: 68 }
          : { top: 170, bottom: 215, left: 440, right: 95 },
        duration: 700,
        maxZoom: 16,
      },
    )
  }, [mapReady, route])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !focusLocation) return
    const key = focusLocation.join(',')
    if (previousFocusRef.current === key) return
    previousFocusRef.current = key
    map.flyTo({ center: focusLocation, zoom: Math.max(map.getZoom(), 15), duration: 650, essential: true })
  }, [mapReady, focusLocation])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode])

  return <div ref={containerRef} className="map-canvas" />
}
