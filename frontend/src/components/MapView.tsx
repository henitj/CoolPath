import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, StyleSpecification, LayerSpecification, GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type {
  FeatureCollection,
  HazardFeature,
  RouteResponse,
  ShadowResponse,
} from '../types'

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

const AUSTIN: [number, number] = [-97.7431, 30.2672]

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

function ensureGeojsonSource(map: MapLibreMap, id: string, data: unknown) {
  if (map.getSource(id)) {
    ;(map.getSource(id) as GeoJSONSource).setData(data as never)
  } else {
    map.addSource(id, { type: 'geojson', data: data as never })
  }
}

function ensureLayer(map: MapLibreMap, id: string, spec: LayerSpecification) {
  if (!map.getLayer(id)) map.addLayer(spec)
}

export default function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const originMarker = useRef<maplibregl.Marker | null>(null)
  const destMarker = useRef<maplibregl.Marker | null>(null)
  const onClickRef = useRef(props.onMapClick)
  onClickRef.current = props.onMapClick

  // ---- init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: AUSTIN,
      zoom: 14.2,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.on('load', () => {
      // static ordering: lowest first
      ensureLayer(map, 'parks-fill', {
        id: 'parks-fill', type: 'fill', source: 'parks-src',
        paint: { 'fill-color': '#14532d', 'fill-opacity': 0.35 },
      } as never)
      ensureLayer(map, 'water-fill', {
        id: 'water-fill', type: 'fill', source: 'water-src',
        paint: { 'fill-color': '#0c4a6e', 'fill-opacity': 0.85 },
      } as never)
      ensureLayer(map, 'heat-fill', {
        id: 'heat-fill', type: 'fill', source: 'heat-src',
        paint: {
          'fill-color': [
            'interpolate', ['linear'], ['get', 'warmth'],
            0, 'rgba(49,46,129,0.0)', 0.35, 'rgba(14,165,233,0.45)',
            0.55, 'rgba(250,204,21,0.55)', 0.75, 'rgba(249,115,22,0.6)',
            1, 'rgba(220,38,38,0.65)',
          ],
        },
      } as never)
      ensureLayer(map, 'buildings-fill', {
        id: 'buildings-fill', type: 'fill', source: 'buildings-src',
        paint: {
          'fill-color': [
            'interpolate', ['linear'], ['get', 'height_m'],
            5, 'rgba(51,65,85,0.55)', 40, 'rgba(99,102,241,0.55)', 200, 'rgba(165,180,252,0.7)',
          ],
        },
      } as never)
      ensureLayer(map, 'canopy-fill', {
        id: 'canopy-fill', type: 'fill', source: 'canopy-src',
        paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.4 },
      } as never)
      ensureLayer(map, 'shadow-fill', {
        id: 'shadow-fill', type: 'fill', source: 'shadow-src',
        paint: { 'fill-color': '#020617', 'fill-opacity': 0.42 },
      } as never)
      ensureLayer(map, 'route-baseline-line', {
        id: 'route-baseline-line', type: 'line', source: 'route-baseline-src',
        paint: { 'line-color': '#94a3b8', 'line-width': 3, 'line-dasharray': [2, 2] },
      } as never)
      ensureLayer(map, 'route-casing-line', {
        id: 'route-casing-line', type: 'line', source: 'route-src',
        paint: { 'line-color': '#0b1220', 'line-width': 8, 'line-opacity': 0.6 },
      } as never)
      ensureLayer(map, 'route-line', {
        id: 'route-line', type: 'line', source: 'route-src',
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#22d3ee'],
          'line-width': 5,
        },
      } as never)
      ensureLayer(map, 'hazard-circle', {
        id: 'hazard-circle', type: 'circle', source: 'hazards-src',
        paint: {
          'circle-color': ['coalesce', ['get', 'color'], '#f97316'],
          'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 1, 5, 5, 10],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#e2e8f0',
          'circle-opacity': 0.9,
        },
      } as never)
      setMapLoaded(true)
    })
    map.on('click', (e) => {
      onClickRef.current([Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))])
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ---- push data into sources
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const { heat, canopy, buildings, water, parks, shadows, hazards, route, layers } = props

    ensureGeojsonSource(map, 'heat-src', heat ?? EMPTY_FC)
    ensureGeojsonSource(map, 'canopy-src', canopy ?? EMPTY_FC)
    ensureGeojsonSource(map, 'buildings-src', buildings ?? EMPTY_FC)
    ensureGeojsonSource(map, 'water-src', water ?? EMPTY_FC)
    ensureGeojsonSource(map, 'parks-src', parks ?? EMPTY_FC)
    const shadowFC: unknown = shadows
      ? {
          type: 'FeatureCollection',
          features: shadows.geometry ? [{ type: 'Feature', properties: shadows.properties, geometry: shadows.geometry }] : [],
        }
      : EMPTY_FC
    ensureGeojsonSource(map, 'shadow-src', shadowFC)
    ensureGeojsonSource(map, 'hazards-src', {
      type: 'FeatureCollection',
      features: hazards,
    })

    const baseline = route?.baseline
    ensureGeojsonSource(map, 'route-src', route ? { type: 'FeatureCollection', features: [route] } : EMPTY_FC)
    ensureGeojsonSource(map, 'route-baseline-src', baseline
      ? { type: 'FeatureCollection', features: [baseline] }
      : EMPTY_FC)

    map.setLayoutProperty('heat-fill', 'visibility', layers.heat ? 'visible' : 'none')
    map.setLayoutProperty('canopy-fill', 'visibility', layers.canopy ? 'visible' : 'none')
    map.setLayoutProperty('buildings-fill', 'visibility', layers.buildings ? 'visible' : 'none')
    map.setLayoutProperty('shadow-fill', 'visibility', layers.shadows ? 'visible' : 'none')
    map.setLayoutProperty('hazard-circle', 'visibility', layers.hazards ? 'visible' : 'none')
    map.setLayoutProperty('route-line', 'visibility', route ? 'visible' : 'none')
    map.setLayoutProperty('route-casing-line', 'visibility', route ? 'visible' : 'none')
    map.setLayoutProperty('route-baseline-line', 'visibility', baseline ? 'visible' : 'none')

    if (route) {
      const coords = route.geometry.coordinates
      const lons = coords.map((c) => c[0])
      const lats = coords.map((c) => c[1])
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 90, duration: 700, maxZoom: 15.5 },
      )
    }
  }, [mapLoaded, props.heat, props.canopy, props.buildings, props.water, props.parks, props.shadows,
    props.hazards, props.route, props.layers])

  // ---- origin / destination markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const mk = (color: string, label: string) =>
      new maplibregl.Marker({ color })
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(label))
    if (originMarker.current) {
      originMarker.current.remove()
      originMarker.current = null
    }
    if (destMarker.current) {
      destMarker.current.remove()
      destMarker.current = null
    }
    if (props.origin) {
      originMarker.current = mk('#22d3ee', 'Origin').setLngLat(props.origin).addTo(map)
    }
    if (props.destination) {
      destMarker.current = mk('#f97316', 'Destination').setLngLat(props.destination).addTo(map)
    }
  }, [props.origin, props.destination])

  // ---- cursor + active route color refresh
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = props.pickMode ? 'crosshair' : ''
  }, [props.pickMode])

  useEffect(() => {
    const map = mapRef.current
    if (map && map.isStyleLoaded()) {
      if (map.getLayer('route-line')) {
        map.setPaintProperty('route-line', 'line-color', [
          'coalesce', ['get', 'color'], '#22d3ee',
        ])
      }
    }
  }, [props.route])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {props.pickMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-cyan-400/40 bg-slate-900/85 px-4 py-1.5 text-sm text-cyan-200 shadow-panel">
          Click the map to set the <b>{props.pickMode}</b>
        </div>
      )}
    </div>
  )
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] }
