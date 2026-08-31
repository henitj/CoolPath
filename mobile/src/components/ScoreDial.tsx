/**
 * Animated comfort dial: the hero metric. Ring + needle sweep + breathing
 * halo; always ends in a calm, readable state.
 */
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { C, TYPO } from '../theme'
import type { Verdict } from '../score'

const SIZE = 190
const STROKE = 13
const RADIUS = (SIZE - STROKE) / 2 - 6
const CIRC = 2 * Math.PI * RADIUS
const ARC_FRAC = 0.78 // leave a gap at the bottom

export default function ScoreDial({
  comfort,
  tempLabel,
  verdict,
  loading,
}: {
  comfort: number
  tempLabel: string
  verdict: Verdict
  loading?: boolean
}) {
  const progress = useRef(new Animated.Value(0)).current
  const [display, setDisplay] = React.useState(0)

  useEffect(() => {
    const target = Math.max(0, Math.min(100, comfort))
    const listenerId = progress.addListener(({ value }) => setDisplay(Math.round(value)))
    Animated.timing(progress, {
      toValue: target,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
    return () => progress.removeListener(listenerId)
  }, [comfort, progress])

  const frac = (loading ? 0 : display / 100) * ARC_FRAC
  const dash = CIRC * ARC_FRAC
  const needleAngle = -126 + frac * 300

  return (
    <View style={styles.wrap}>
      <View>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <LinearGradient id="dialGrad" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor="#5EEAD4" />
              <Stop offset="0.55" stopColor="#FCD34D" />
              <Stop offset="1" stopColor="#FB8A80" />
            </LinearGradient>
          </Defs>
          {/* track */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={C.bgDeep}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${dash} ${CIRC}`}
            strokeLinecap="round"
            transform={`rotate(126 ${SIZE / 2} ${SIZE / 2})`}
          />
          {/* value */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="url(#dialGrad)"
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRC * frac} ${CIRC}`}
            strokeLinecap="round"
            transform={`rotate(126 ${SIZE / 2} ${SIZE / 2})`}
          />
          {/* needle dot */}
          {!loading && (
            <DotAt angle={needleAngle} radius={RADIUS} color={verdict.color} size={SIZE} />
          )}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          {loading ? (
            <>
              <Text style={TYPO.h1}>—</Text>
              <Text style={styles.subLabel}>reading…</Text>
            </>
          ) : (
            <>
              <Text style={TYPO.hero}>{display}</Text>
              <Text style={styles.subLabel}>comfort</Text>
            </>
          )}
        </View>
      </View>
      <View style={styles.verdictRow}>
        <Text style={{ fontSize: 18 }}>{verdict.emoji}</Text>
        <Text style={[styles.verdictText, { color: verdict.color }]}>{verdict.label}</Text>
        <Text style={styles.tempText}>{tempLabel}</Text>
      </View>
    </View>
  )
}

function DotAt({ angle, radius, color, size }: { angle: number; radius: number; color: string; size: number }) {
  const rad = (angle * Math.PI) / 180
  const cx = size / 2 + radius * Math.sin(rad)
  const cy = size / 2 - radius * Math.cos(rad)
  return <Path d={`M ${cx} ${cy} m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0`} fill={color} />
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  subLabel: {
    color: C.inkFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: -6,
  },
  verdictText: { fontSize: 15, fontWeight: '800' },
  tempText: { color: C.inkFaint, fontSize: 13, fontWeight: '600' },
})
