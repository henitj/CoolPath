/**
 * NearbyRadar — the living mini-map.
 *
 * An SVG "you are here" compass that visualises the immediate micro-climate:
 *  - shade sectors (leaf-green ribbons) drawn from real shade %
 *  - hazard dots at their true bearings/distances (50 m ring)
 *  - the sun's actual position around the ring
 */
import React from 'react'
import Svg, { Circle, Defs, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg'
import type { HazardFeature } from '../types'

interface NearbyRadarProps {
  shadePct: number
  sunAzimuthDeg: number
  isDaytime: boolean
  hazards: HazardFeature[]
  lat: number
  lon: number
  size?: number
}

const SIZE = 210
const CENTER = SIZE / 2
const RING_R = 88

function polar(angleDeg: number, radius: number): [number, number] {
  // 0° = North, clockwise
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)]
}

function sectorPath(startDeg: number, endDeg: number, rInner: number, rOuter: number): string {
  const [x1, y1] = polar(startDeg, rOuter)
  const [x2, y2] = polar(endDeg, rOuter)
  const [x3, y3] = polar(endDeg, rInner)
  const [x4, y4] = polar(startDeg, rInner)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`
}

export default function NearbyRadar({
  shadePct,
  sunAzimuthDeg,
  isDaytime,
  hazards,
  lat,
  lon,
  size = SIZE,
}: NearbyRadarProps) {
  // Shade sectors: split the ring into 8 compass sectors; coverage grows with
  // total shade, drawn as ribbons just outside the center node.
  const sectors = 8
  const shadedCount = Math.round((shadePct / 100) * sectors)
  const ribbons: string[] = []
  for (let i = 0; i < sectors; i++) {
    const start = i * 45 - 22.5 + 2
    const end = i * 45 + 22.5 - 2
    if (i < shadedCount) {
      ribbons.push(sectorPath(start, end, 34, 52))
    }
  }

  // Hazards: project onto the ring by bearing & distance (ring == 50 m)
  const dots = hazards.slice(0, 10).map((h) => {
    const [hLon, hLat] = h.geometry.coordinates
    const dLat = hLat - lat
    const dLon = (hLon - lon) * Math.cos((lat * Math.PI) / 180)
    const dist = Math.sqrt(dLat * dLat + dLon * dLon) * 111320
    const bearing = (Math.atan2(dLon, dLat) * 180) / Math.PI + 180
    const r = Math.min(1, dist / 50) * RING_R
    const [x, y] = polar(bearing, Math.max(58, r))
    return { x, y, color: h.properties.color, sev: h.properties.severity }
  })

  const [sunX, sunY] = polar(sunAzimuthDeg, RING_R - 8)

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Defs>
        <RadialGradient id="radarGlow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#5EEAD4" stopOpacity="0.2" />
          <Stop offset="0.7" stopColor="#5EEAD4" stopOpacity="0.05" />
          <Stop offset="1" stopColor="#5EEAD4" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Circle cx={CENTER} cy={CENTER} r={CENTER - 2} fill="#0D423C" />
      <Circle cx={CENTER} cy={CENTER} r={CENTER - 2} fill="url(#radarGlow)" />
      <Circle cx={CENTER} cy={CENTER} r={RING_R} fill="none" stroke="#1E5F55" strokeWidth={1.4} />
      <Circle cx={CENTER} cy={CENTER} r={58} fill="none" stroke="#174F47" strokeWidth={1} />
      <Circle cx={CENTER} cy={CENTER} r={34} fill="none" stroke="#174F47" strokeWidth={1} />

      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const [x1, y1] = polar(a, RING_R + 3)
        const [x2, y2] = polar(a, RING_R + 8)
        return <Path key={a} d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke="#2E6B60" strokeWidth={1.6} />
      })}
      <SvgText x={CENTER} y={16} fill="#6E9C93" fontSize={9.5} textAnchor="middle" fontWeight="700">
        N
      </SvgText>
      <SvgText x={SIZE - 10} y={CENTER + 4} fill="#6E9C93" fontSize={9.5} textAnchor="middle" fontWeight="700">
        E
      </SvgText>
      <SvgText x={CENTER} y={SIZE - 4} fill="#6E9C93" fontSize={9.5} textAnchor="middle" fontWeight="700">
        S
      </SvgText>
      <SvgText x={10} y={CENTER + 4} fill="#6E9C93" fontSize={9.5} textAnchor="middle" fontWeight="700">
        W
      </SvgText>

      {ribbons.map((d, i) => (
        <Path key={i} d={d} fill="#34D399" opacity={0.55} />
      ))}

      {isDaytime && (
        <>
          <Circle cx={sunX} cy={sunY} r={9} fill="#FCD34D" opacity={0.25} />
          <Circle cx={sunX} cy={sunY} r={4.6} fill="#FCD34D" />
        </>
      )}

      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={3.4 + d.sev * 0.6} fill={d.color} stroke="#0B3B36" strokeWidth={1.2} />
      ))}

      <Circle cx={CENTER} cy={CENTER} r={17} fill="#5EEAD4" opacity={0.18} />
      <Circle cx={CENTER} cy={CENTER} r={8.5} fill="#5EEAD4" stroke="#0B3B36" strokeWidth={2} />
    </Svg>
  )
}
