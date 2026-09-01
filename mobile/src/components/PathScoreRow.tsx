/**
 * Route comparison row: score badge, route facts, and the calm delta vs
 * the shortest path ("2 min more · 4° cooler").
 */
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { C, R } from '../theme'
import { deltaSummary, formatDistance, formatMinutes, formatTempUnit } from '../format'
import type { ProfileId, RouteResponse, Units } from '../types'
import { profileCopy } from '../score'

export default function PathScoreRow({
  route,
  units,
  isPrimary,
  onPress,
}: {
  route: RouteResponse
  units: Units
  isPrimary: boolean
  onPress?: () => void
}) {
  const m = route.properties.metrics
  const copy = profileCopy(route.properties.profile)
  const cmp = route.comparison
  const delta = cmp ? deltaSummary(cmp.temp_delta_c, cmp.shade_delta_pct) : null
  const timeDelta =
    cmp && Math.abs(cmp.effort_delta_min) >= 0.5
      ? `${formatMinutes(Math.abs(cmp.effort_delta_min))} ${cmp.effort_delta_min > 0 ? 'slower' : 'faster'}`
      : null

  return (
    <View style={[styles.card, isPrimary && styles.cardPrimary]}>
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: withAlpha(route.properties.color, 0.18) }]}>
          <Text style={[styles.badgeText, { color: route.properties.color }]}>
            {Math.round(m.comfort_score)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.title}>{copy.title}</Text>
            {isPrimary && <View style={styles.pill}><Text style={styles.pillText}>RECOMMENDED</Text></View>}
          </View>
          <Text style={styles.blurb}>{copy.blurb}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <Metric label="Walk" value={formatMinutes(m.est_walk_min)} />
        <Metric label="Distance" value={formatDistance(m.distance_m)} />
        <Metric label="Surface" value={formatTempUnit(m.avg_temp_c, units)} />
        <Metric label="Shade" value={`${Math.round(m.shade_pct)}%`} />
      </View>

      {(delta || timeDelta) && (
        <View style={styles.deltaRow}>
          {delta && <Text style={styles.deltaGood}>{delta}</Text>}
          {timeDelta && <Text style={styles.deltaTime}>{timeDelta} vs shortest</Text>}
        </View>
      )}
      {m.hazard_count > 0 && (
        <Text style={styles.hazardNote}>
          Caution: {m.hazard_count} reported hazard{m.hazard_count > 1 ? 's' : ''} along this path
        </Text>
      )}
    </View>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: R.l,
    borderWidth: 1,
    borderColor: C.lineSoft,
    padding: 14,
    gap: 12,
  },
  cardPrimary: { borderColor: C.mint, borderWidth: 1.5 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 19, fontWeight: '800' },
  title: { color: C.ink, fontSize: 16, fontWeight: '800' },
  pill: {
    backgroundColor: C.mint,
    borderRadius: R.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pillText: { color: C.bgDeep, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8 },
  blurb: { color: C.inkFaint, fontSize: 12, marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricValue: { color: C.ink, fontSize: 15, fontWeight: '700' },
  metricLabel: { color: C.inkFaint, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  deltaGood: { color: C.mint, fontSize: 12.5, fontWeight: '700' },
  deltaTime: { color: C.inkFaint, fontSize: 12.5, fontWeight: '600' },
  hazardNote: { color: C.amber, fontSize: 12, fontWeight: '600' },
})

export function profileColor(p: ProfileId): string {
  return p === 'cool' ? C.cool : p === 'safe' ? C.safe : C.fast
}
