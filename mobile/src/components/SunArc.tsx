/**
 * SunArc — today's sun path with the current position marked, plus golden
 * hour shading. Answers "when will shade get better?" at a glance.
 */
import React from 'react'
import Svg, { Circle, Path, Text as SvgText, Line } from 'react-native-svg'
import { C } from '../theme'

const W = 300
const H = 84
const PAD = 18

export default function SunArc({
  altitudeDeg,
  azimuthDeg,
  isDaytime,
  currentHour,
}: {
  altitudeDeg: number
  azimuthDeg: number
  isDaytime: boolean
  currentHour: number
}) {
  // Arc across the day (6:00 → 20:00)
  const t = Math.max(0, Math.min(1, (currentHour - 6) / 14))
  const x = PAD + t * (W - PAD * 2)
  const peak = 46
  const y = H - 18 - Math.max(0, Math.sin(t * Math.PI)) * peak

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* golden hour zones */}
      <Path d={`M ${PAD} ${H - 12} L ${PAD} ${H - 14} Q ${W / 2} ${H - 66} ${W - PAD} ${H - 14} L ${W - PAD} ${H - 12} Z`} fill="#1E5F55" opacity={0.5} />
      <Path
        d={`M ${PAD} ${H - 14} Q ${W / 2} ${H - 66} ${W - PAD} ${H - 14}`}
        stroke="#2E6B60"
        strokeWidth={1.6}
        strokeDasharray="4 5"
        fill="none"
      />
      {/* current sun */}
      {isDaytime ? (
        <>
          <Circle cx={x} cy={y} r={11} fill="#FCD34D" opacity={0.22} />
          <Circle cx={x} cy={y} r={5.4} fill="#FCD34D" stroke="#0B3B36" strokeWidth={1.4} />
        </>
      ) : (
        <Circle cx={x} cy={H - 15} r={4.6} fill="#6E9C93" />
      )}
      <Line x1={PAD} y1={H - 12} x2={W - PAD} y2={H - 12} stroke="#174F47" strokeWidth={1.2} />
      <SvgText x={PAD} y={H - 2} fill={C.inkFaint} fontSize={9} fontWeight="700">
        6a
      </SvgText>
      <SvgText x={W / 2 - 6} y={H - 2} fill={C.inkFaint} fontSize={9} fontWeight="700">
        1p
      </SvgText>
      <SvgText x={W - PAD - 14} y={H - 2} fill={C.inkFaint} fontSize={9} fontWeight="700">
        8p
      </SvgText>
      <SvgText
        x={Math.min(W - 46, Math.max(4, x - 14))}
        y={Math.max(12, y - 14)}
        fill={isDaytime ? '#FCD34D' : C.inkFaint}
        fontSize={9.5}
        fontWeight="800"
      >
        {isDaytime ? `${Math.round(altitudeDeg)}° alt` : 'below horizon'}
      </SvgText>
      {/* azimuth note */}
      <SvgText x={W - PAD} y={16} fill={C.inkFaint} fontSize={9} fontWeight="700" textAnchor="end">
        az {Math.round(azimuthDeg)}°
      </SvgText>
    </Svg>
  )
}
