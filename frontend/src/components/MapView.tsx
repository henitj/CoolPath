import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection, HazardFeature, RouteResponse, ShadowResponse } from '../types'

export interface LayerToggles {
  heat: boolean
  canopy: boolean
  buildings: boolean
  shadows: boolean
  hazards: boolean
}

interface MapViewProps {
  heat: FeatureCollection | null
  canopy: FeatureCollection | null
  buildings: FeatureCollection | null
  water: FeatureCollection | null
  parks: FeatureCollection | null
  shadows: ShadowResponse | null
  hazards: HazardFeature[]
  route: RouteResponse | null
  layers: LayerToggles
  origin: [number, number] | null
  destination: [number, number] | null
  pickMode: 'origin' | 'destination' | null
  onMapClick: (coord: [number, number]) => void
}

const AUSTIN_CENTER: [number, number] = [-97.7431, 30.2672]
const EMPTY_FEATURES: FeatureCollection = { type: 'FeatureCollection', features: [] }

const BASE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors · © CARTO',
    },
  },
  layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
}

function setSourceData(map: MapLibreMap, id: string, data: unknown) {
  const existing = map.getSource(id) as GeoJSONSource | undefined
  if (existing) {
    existing.setData(data as never)
  } else {
    map.addSource(id, { type: 'geojson', data: data as never })
  }
}

function addLayerIfMissing(map: MapLibreMap, layer: LayerSpecification) {
  if (!map.getLayer(layer.id)) map.addLayer(layer)
}

export default function MapView({
  heat,
  canopy,
  buildings,
  water,
  parks,
  shadows,
  hazards,
  route,
  layers,
  origin,
  destination,
  pickMode,
  onMapClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const originMarker = useRef<maplibregl.Marker | null>(null)
  const destinationMarker = useRef<maplibregl.Marker | null>(null)
  const onClickRef = useRef(onMapClick)

  useEffect(() => {
    onClickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: AUSTIN_CENTER,
      zoom: 14.2,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      // Render order: lower layers first.
      addLayerIfMissing(map, {
        id: 'parks-fill',
        type: 'fill',
        source: 'parks-src',
        paint: { 'fill-color': '#14532d', 'fill-opacity': 0.35 },
      } as LayerSpecification)
      addLayerIfMissing(map, {
        id: 'water-fill',
        type: 'fill',
        source: 'water-src',
        paint: { 'fill-color': '#0c4a6e', 'fill-opacity': 0.85 },
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
            0,
            'rgba(49,46,129,0.0)',
            0.35,
            'rgba(14,165,233,0.45)',
            0.55,
            'rgba(250,204,21,0.55)',
            0.75,
            'rgba(249,115,22,0.6)',
            1,
            'rgba(220,38,38,0.65)',
          ],
        },
      } as LayerSpecification)
      addLayerIfMissing(map, {
        id: 'buildings-fill',
        type: 'fill',
        source: 'buildings-src',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'height_m'],
            5,
            'rgba(51,65,85,0.55)',
            40,
            'rgba(99,102,241,0.55)',
            200,
            'rgba(165,180,252,0.7)',
          ],
        },
      } as LayerSpecification)
      addLayerIfMissing(map, {
        id: 'canopy-fill',
        type: 'fill',
        source: 'canopy-src',
        paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.4 },
      } as LayerSpecification)
      addLayerIfMissing(map, {
        id: 'shadow-fill',
        type: 'fill',
        source: 'shadow-src',
        paint: { 'fill-color': '#020617', 'fill-opacity': 0.42 },
      } as LayerSpecification)
      addLayerIfMissing(map, {
        id: 'route-baseline-line',
        type: 'line',
        source: 'route-baseline-src',
        paint: { 'line-color': '#94a3b8', 'line-width': 3, 'line-dasharray': [2, 2] },
      } as LayerSpecification)
      addLayerIfMissing(map, {
        id: 'route-casing-line',
        type: 'line',
        source: 'route-src',
        paint: { 'line-color': '#0b1220', 'line-width': 8, 'line-opacity': 0.6 },
      } as LayerSpecification)
      addLayerIfMissing(map, {
        id: 'route-line',
        type: 'line',
        source: 'route-src',
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#22d3ee'],
          'line-width': 5,
        },
      } as LayerSpecification)
      addLayerIfMissing(map, {
        id: 'hazard-circle',
        type: 'circle',
        source: 'hazards-src',
        paint: {
          'circle-color': ['coalesce', ['get', 'color'], '#f97316'],
          'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 1, 5, 5, 10],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#e2e8f0',
          'circle-opacity': 0.9,
        },
      } as LayerSpecification)
    })

    map.on('click', (event) => {
      onClickRef.current([
        Number(event.lngLat.lng.toFixed(6)),
        Number(event.lngLat.lat.toFixed(6)),
      ])
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    setSourceData(map, 'heat-src', heat ?? EMPTY_FEATURES)
    setSourceData(map, 'canopy-src', canopy ?? EMPTY_FEATURES)
    setSourceData(map, 'buildings-src', buildings ?? EMPTY_FEATURES)
    setSourceData(map, 'water-src', water ?? EMPTY_FEATURES)
    setSourceData(map, 'parks-src', parks ?? EMPTY_FEATURES)

    const shadowCollection = shadows?.geometry
      ? {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: shadows.properties, geometry: shadows.geometry }],
        }
      : EMPTY_FEATURES
    setSourceData(map, 'shadow-src', shadowCollection)
    setSourceData(map, 'hazards-src', { type: 'FeatureCollection', features: hazards })

    const baseline = route?.baseline
    setSourceData(map, 'route-src', route ? { type: 'FeatureCollection', features: [route] } : EMPTY_FEATURES)
    setSourceData(map, 'route-baseline-src', baseline ? { type: 'FeatureCollection', features: [baseline] } : EMPTY_FEATURES)

    const visibility = (visible: boolean) => (visible ? 'visible' : 'none')
    map.setLayoutProperty('heat-fill', 'visibility', visibility(layers.heat))
    map.setLayoutProperty('canopy-fill', 'visibility', visibility(layers.canopy))
    map.setLayoutProperty('buildings-fill', 'visibility', visibility(layers.buildings))
    map.setLayoutProperty('shadow-fill', 'visibility', visibility(layers.shadows))
    map.setLayoutProperty('hazard-circle', 'visibility', visibility(layers.hazards))
    map.setLayoutProperty('route-line', 'visibility', visibility(Boolean(route)))
    map.setLayoutProperty('route-casing-line', 'visibility', visibility(Boolean(route)))
    map.setLayoutProperty('route-baseline-line', 'visibility', visibility(Boolean(baseline)))

    if (route) {
      const coordinates = route.geometry.coordinates
      const lons = coordinates.map((coordinate) => coordinate[0])
      const lats = coordinates.map((coordinate) => coordinate[1])
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 90, duration: 700, maxZoom: 15.5 },
      )
    }
  }, [heat, canopy, buildings, water, parks, shadows, hazards, route, layers])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    originMarker.current?.remove()
    destinationMarker.current?.remove()
    originMarker.current = null
    destinationMarker.current = null

    const makeMarker = (color: string, label: string, position: [number, number]) => {
      const marker = new maplibregl.Marker({ color })
      marker.setPopup(new maplibregl.Popup({ offset: 14 }).setText(label))
      return marker.setLngLat(position).addTo(map)
    }

    if (origin) originMarker.current = makeMarker('#22d3ee', 'Origin', origin)
    if (destination) destinationMarker.current = makeMarker('#f97316', 'Destination', destination)
  }, [origin, destination])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {pickMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-cyan-400/40 bg-slate-900/85 px-4 py-1.5 text-sm text-cyan-200 shadow-panel">
          Click the map to set the <b>{pickMode}</b>
        </div>
      )}
    </div>
  )
}
