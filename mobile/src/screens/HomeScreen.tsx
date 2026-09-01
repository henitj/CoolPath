/**
 * Home — "How's my walk right now?"
 * Hero comfort dial · living radar · conditions · sun arc · quick actions.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useApp } from '../state'
import { useBusy } from '../busy'
import { api, friendlyError } from '../api'
import { Card, SectionTitle } from '../components/Card'
import ScoreDial from '../components/ScoreDial'
import NearbyRadar from '../components/NearbyRadar'
import SunArc from '../components/SunArc'
import { ErrorNotice, LoadingDots } from '../components/Feedback'
import { coachingTip, shadeLabel, sunTip, tempBand, verdictForComfort } from '../score'
import { formatClock, formatTempUnit } from '../format'
import type { NowConditions } from '../types'
import { C, R, TYPO } from '../theme'

export default function HomeScreen({ onGoRouting }: { onGoRouting: () => void }) {
  const { coords, hazards, locationNote, locationStatus, units, refreshLocation } = useApp()
  const busy = useBusy()
  const [now, setNow] = useState<NowConditions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    busy.start()
    try {
      const data = await api.now(coords.lat, coords.lon)
      setNow(data)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      busy.stop()
      setLoading(false)
    }
  }, [coords.lat, coords.lon, busy])

  useEffect(() => {
    void load()
    const iv = setInterval(() => void load(), 60000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.lat, coords.lon])

  const verdict = now ? verdictForComfort(now.comfort) : verdictForComfort(0)
  const band = now ? tempBand(now.temp_c) : tempBand(0)
  const nearbyHazards = hazards.filter((h) => {
    const [lon, lat] = h.geometry.coordinates
    return Math.abs(lat - coords.lat) < 0.0025 && Math.abs(lon - coords.lon) < 0.0025
  })

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.greeting}>{greeting()}</Text>
      <Text style={styles.locationNote}>
        {locationNote} · {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
      </Text>

      <Card style={styles.heroCard}>
        <ScoreDial
          comfort={now?.comfort ?? 0}
          loading={loading && !now}
          tempLabel={now ? formatTempUnit(now.temp_c, units) : ''}
          verdict={verdict}
        />
        <Text style={styles.verdictMessage}>
          {loading && !now ? 'Reading the street…' : verdict.message}
        </Text>
        {now && <Text style={styles.coach}>{coachingTip({ comfort: now.comfort, shadePct: now.shade_pct, tempC: now.temp_c, isDaytime: now.sun.is_daytime })}</Text>}
        {error && (
          <View style={{ marginTop: 12 }}>
            <ErrorNotice message={error} onRetry={load} />
          </View>
        )}
        {now && (
          <Text style={styles.updatedAt}>measured {formatClock(now.timestamp)} · updated every minute</Text>
        )}
      </Card>

      <SectionTitle
        right={
          <TouchableOpacity onPress={() => void refreshLocation()}>
            <Text style={styles.refresh}>↻ recentre</Text>
          </TouchableOpacity>
        }
      >
        Around you · 50 m
      </SectionTitle>

      <Card style={styles.radarCard}>
        <View style={styles.radarRow}>
          <NearbyRadar
            shadePct={now?.shade_pct ?? 0}
            sunAzimuthDeg={now?.sun.azimuth_deg ?? 180}
            isDaytime={now?.sun.is_daytime ?? true}
            hazards={nearbyHazards}
            lat={coords.lat}
            lon={coords.lon}
            size={196}
          />
          <View style={styles.radarLegend}>
            <LegendDot color="#34D399" label={`${Math.round(now?.shade_pct ?? 0)}% shaded`} sub={shadeLabel(now?.shade_pct ?? 0)} />
            <LegendDot color="#FCD34D" label={now?.sun.is_daytime ? 'Sun up' : 'Sun down'} sub={now ? sunTip(now.sun.altitude_deg, now.sun.is_daytime) : ''} />
            <LegendDot
              color={nearbyHazards.length ? '#FB8A80' : '#2E6B60'}
              label={nearbyHazards.length ? `${nearbyHazards.length} hazard${nearbyHazards.length > 1 ? 's' : ''} near` : 'No hazards near'}
              sub={nearbyHazards.length ? 'on this block' : 'within 50 m'}
            />
          </View>
        </View>
      </Card>

      <SectionTitle>Conditions</SectionTitle>
      <View style={styles.grid}>
        <StatTile label="Surface" value={now ? formatTempUnit(now.temp_c, units) : '—'} sub={band.label} color={band.color} />
        <StatTile label="Shade" value={now ? `${Math.round(now.shade_pct)}%` : '—'} sub={shadeLabel(now?.shade_pct ?? 0)} color="#34D399" />
        <StatTile label="Canopy" value={now ? `${Math.round(now.canopy_pct)}%` : '—'} sub="tree cover" color="#5EEAD4" />
        <StatTile label="Greenery" value={now ? `${Math.round(Math.max(0, now.ndvi) * 100)}` : '—'} sub="NDVI index" color="#A7F3A0" />
      </View>

      <SectionTitle>Today's sun</SectionTitle>
      <Card>
        <SunArc
          altitudeDeg={now?.sun.altitude_deg ?? 0}
          azimuthDeg={now?.sun.azimuth_deg ?? 180}
          isDaytime={now?.sun.is_daytime ?? true}
          currentHour={new Date().getHours() + new Date().getMinutes() / 60}
        />
        <Text style={styles.sunNote}>
          {now ? sunTip(now.sun.altitude_deg, now.sun.is_daytime) : 'Waiting for sun data…'}
        </Text>
      </Card>

      <TouchableOpacity style={styles.cta} onPress={onGoRouting} activeOpacity={0.85}>
        <Text style={styles.ctaText}>Find my coolest route →</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function LegendDot({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.legendLabel}>{label}</Text>
        <Text style={styles.legendSub}>{sub}</Text>
      </View>
    </View>
  )
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </View>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Late night, walker'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 4 },
  greeting: { ...TYPO.h1, marginBottom: 2 },
  locationNote: { color: C.inkFaint, fontSize: 12.5, fontWeight: '600', marginBottom: 14 },
  heroCard: { alignItems: 'center', paddingVertical: 22, gap: 8 },
  verdictMessage: { color: C.ink, fontSize: 15.5, fontWeight: '700', textAlign: 'center' },
  coach: { color: C.inkDim, fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 10 },
  updatedAt: { color: C.inkFaint, fontSize: 10.5, marginTop: 2 },
  radarCard: { paddingVertical: 18 },
  radarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  radarLegend: { flex: 1, gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: C.ink, fontSize: 13.5, fontWeight: '700' },
  legendSub: { color: C.inkFaint, fontSize: 11.5, marginTop: 1 },
  grid: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.m,
    borderWidth: 1,
    borderColor: C.lineSoft,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  tileValue: { fontSize: 19, fontWeight: '800' },
  tileLabel: { color: C.inkFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  tileSub: { color: C.inkFaint, fontSize: 9.5 },
  sunNote: { color: C.inkDim, fontSize: 12.5, textAlign: 'center', marginTop: 4 },
  refresh: { color: C.mint, fontSize: 12.5, fontWeight: '700' },
  cta: {
    marginTop: 18,
    backgroundColor: C.mint,
    borderRadius: R.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: { color: C.bgDeep, fontSize: 15.5, fontWeight: '800' },
})
