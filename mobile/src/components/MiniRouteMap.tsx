/**
 * MiniRouteMap — calm SVG preview of the route: the polyline (auto-fitted),
 * its canopy/shade ribbon drawn from sampled shade values, start/end pins.
 */
import React from 'react'
import Svg, { Circle, Path, Polygon } from 'react-native-svg'
import type { RouteResponse } from '../types'
import { routeDistanceM } from '../format'

export default function MiniRouteMap({
  route,
  width,
  height = 132,
  baseline,
}: {
  route: RouteResponse
  width: number
  height?: number
  baseline?: RouteResponse | null
}) {
  const coords = route.geometry.coordinates
  if (!coords || coords.length < 2) return null

  const lons = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const spanLon = Math.max(maxLon - minLon, 1e-5)
  const spanLat = Math.max(maxLat - minLat, 1e-5)
  const pad = 22
  const scaleX = (width - pad * 2) / spanLon
  const scaleY = (height - pad * 2) / spanLat
  const s = Math.min(scaleX, scaleY)
  const px = (lon: number) => pad + (lon - minLon) * s + (width - pad * 2 - spanLon * s) / 2
  const py = (lat: number) => height - pad - (lat - minLat) * s - (height - pad * 2 - spanLat * s) / 2

  const pts = coords.map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')
  const d = `M ${pts.replace(/ /g, ' L ')}`

  // shade ribbon: exaggerate the line sideways based on shade (visual sugar)
  const shade = route.properties.metrics.shade_pct / 100
  const ribbonWidth = 3 + shade * 7

  const first = coords[0]
  const last = coords[coords.length - 1]
  void routeDistanceM

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {baseline?.geometry?.coordinates && baseline.geometry.coordinates.length >= 2 && (
        <Polygon
          points={baseline.geometry.coordinates.map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="#6E9C93"
          strokeWidth={1.6}
          strokeDasharray="3 4"
        />
      )}
      <Path d={d} stroke="#34D399" strokeWidth={ribbonWidth + 5} strokeLinecap="round" strokeLinejoin="round" opacity={0.18} fill="none" />
      <Path d={d} stroke="#5EEAD4" strokeWidth={ribbonWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={px(first[0])} cy={py(first[1])} r={5.4} fill="#8DD3FF" stroke="#0B3B36" strokeWidth={1.6} />
      <Circle cx={px(last[0])} cy={py(last[1])} r={5.4} fill="#FB8A80" stroke="#0B3B36" strokeWidth={1.6} />
    </Svg>
  )
}
