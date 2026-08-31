/**
 * Route — pick start & destination, compare path scores for all three
 * profiles side by side, with a calm recommendation and mini map.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useApp } from '../state'
import { useBusy } from '../busy'
import { useToast } from '../toast'
import { api, friendlyError } from '../api'
import { Card, SectionTitle } from '../components/Card'
import { Segmented } from '../components/Segmented'
import PathScoreRow from '../components/PathScoreRow'
import MiniRouteMap from '../components/MiniRouteMap'
import PlaceRow from '../components/PlaceRow'
import { ErrorNotice, LoadingDots } from '../components/Feedback'
import { filterPlaces, kindMeta } from '../places'
import { profileCopy } from '../score'
import type { Place, ProfileId, RouteResponse } from '../types'
import { C, R } from '../theme'

type Stop = { label: string; lat: number; lon: number } | null

const PROFILE_OPTS: { value: ProfileId; label: string; sub: string }[] = [
  { value: 'cool', label: '🌳 Coolest', sub: 'shade first' },
  { value: 'safe', label: '🛡️ Easiest', sub: 'safe & smooth' },
  { value: 'fastest', label: '⚡ Shortest', sub: 'no weighting' },
]

export default function RouteScreen({ initialTab }: { initialTab?: 'origin' | 'destination' | null }) {
  const { coords, places, units, hazards, locationNote } = useApp()
  const busy = useBusy()
  const toast = useToast()
  const [origin, setOrigin] = useState<Stop>(null)
  const [destination, setDestination] = useState<Stop>(null)
  const [profile, setProfile] = useState<ProfileId>('cool')
  const [results, setResults] = useState<RouteResponse[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [pickerFor, setPickerFor] = useState<'origin' | 'destination' | null>(initialTab ?? null)
  const [query, setQuery] = useState('')
  const resultsRef = useRef<ScrollView | null>(null)

  // default origin = my location; default destination = Capitol
  useEffect(() => {
    setOrigin({ label: locationNote || 'My location', lat: coords.lat, lon: coords.lon })
  }, [coords.lat, coords.lon, locationNote])

  useEffect(() => {
    if (initialTab) setPickerFor(initialTab)
  }, [initialTab])

  const filtered = useMemo(() => filterPlaces(places, query), [places, query])

  const pick = useCallback(
    (p: Place) => {
      const stop: Stop = { label: p.name, lat: p.lat, lon: p.lon }
      if (pickerFor === 'origin') setOrigin(stop)
      else setDestination(stop)
      setPickerFor(null)
      setQuery('')
    },
    [pickerFor],
  )

  const fetchAll = useCallback(async () => {
    if (!origin || !destination) return
    setSearching(true)
    setError(null)
    setResults([])
    busy.start()
    try {
      const profiles: ProfileId[] = ['cool', 'safe', 'fastest']
      const settled = await Promise.allSettled(
        profiles.map((p) => api.route({ origin: [origin.lon, origin.lat], destination: [destination.lon, destination.lat], profile: p })),
      )
      const ok = settled
        .filter((s): s is PromiseFulfilledResult<RouteResponse> => s.status === 'fulfilled')
        .map((s) => s.value)
      if (!ok.length) {
        const firstError = settled.find((s) => s.status === 'rejected')
        throw firstError?.reason ?? new Error('No routes returned')
      }
      // rank: cool/safe by comfort, fastest stays last unless it wins clearly
      const rank: Record<ProfileId, number> = { cool: 0, safe: 1, fastest: 2 }
      ok.sort((a, b) => {
        const ca = a.properties.metrics.comfort_score - (a.properties.profile === 'fastest' ? 8 : 0)
        const cb = b.properties.metrics.comfort_score - (b.properties.profile === 'fastest' ? 8 : 0)
        return cb - ca || rank[a.properties.profile] - rank[b.properties.profile]
      })
      setResults(ok)
      const best = ok[0]
      toast(`${profileCopy(best.properties.profile).title} route scores ${Math.round(best.properties.metrics.comfort_score)} · ${Math.round(best.properties.metrics.shade_pct)}% shade`, 'good')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      busy.stop()
      setSearching(false)
    }
  }, [origin, destination, busy, toast])

  useEffect(() => {
    if (origin && destination) void fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon])

  const nearbyHazardsNearRoute = useMemo(() => {
    if (!results.length) return 0
    return results[0].properties.metrics.hazard_count
  }, [results])

  return (
    <ScrollView
      ref={resultsRef}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Card style={styles.stopsCard}>
        <StopRow
          icon="🔵"
          label="From"
          stop={origin}
          onPress={() => setPickerFor('origin')}
          accent="#8DD3FF"
        />
        <View style={styles.dash} />
        <StopRow
          icon="🔴"
          label="To"
          stop={destination}
          onPress={() => setPickerFor('destination')}
          accent="#FB8A80"
          placeholder="Choose a destination"
        />
      </Card>

      <SectionTitle>What should we optimise?</SectionTitle>
      <Segmented options={PROFILE_OPTS} value={profile} onChange={setProfile} />
      <Text style={styles.profileBlurb}>{profileCopy(profile).blurb}</Text>

      <TouchableOpacity
        style={[styles.go, (!origin || !destination || searching) && styles.goDisabled]}
        disabled={!origin || !destination || searching}
        onPress={() => void fetchAll()}
        activeOpacity={0.85}
      >
        {searching ? (
          <ActivityIndicator color={C.bgDeep} />
        ) : (
          <Text style={styles.goText}>Compare paths</Text>
        )}
      </TouchableOpacity>

      {error && (
        <View style={{ marginTop: 14 }}>
          <ErrorNotice message={error} onRetry={() => void fetchAll()} retryLabel="Retry" />
        </View>
      )}

      {searching && (
        <View style={{ marginTop: 18, alignItems: 'center' }}>
          <LoadingDots label="Scoring shade, heat & hazards…" />
        </View>
      )}

      {results.length > 0 && !searching && (
        <>
          <SectionTitle right={<Text style={styles.hazardCount}>{nearbyHazardsNearRoute > 0 ? `⚠️ ${nearbyHazardsNearRoute} on best path` : '✓ clear'}</Text>}>
            Path scores
          </SectionTitle>
          <Card style={styles.mapCard}>
            <MiniRouteMap
              route={results[0]}
              baseline={results.find((r) => r.properties.profile === 'fastest') ?? null}
              width={Dimensions.get('window').width - 80}
              height={128}
            />
            <Text style={styles.mapCaption}>
              {results[0].properties.label} · dotted line = shortest path
            </Text>
          </Card>
          <View style={{ gap: 10, marginTop: 10 }}>
            {results.map((r, i) => (
              <PathScoreRow
                key={r.properties.profile}
                route={r}
                units={units}
                isPrimary={i === 0}
              />
            ))}
          </View>
          <Text style={styles.footNote}>
            Scores combine surface heat, shade, hazards, sidewalks and lighting · refreshed live
          </Text>
        </>
      )}

      <Modal visible={pickerFor !== null} animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setPickerFor(null)} hitSlop={10}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Choose {pickerFor ?? ''}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.searchBox}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search places…"
              placeholderTextColor={C.inkFaint}
              style={styles.searchInput}
            />
          </View>
          <Pressable
            style={styles.useMyLocation}
            onPress={() => {
              pick({
                id: '__me',
                name: 'My location',
                lon: coords.lon,
                lat: coords.lat,
                kind: 'intersection',
                blurb: locationNote,
              })
            }}
          >
            <Text style={styles.useMyLocationText}>📍 Use my location</Text>
          </Pressable>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
            {filtered.map((p) => (
              <Pressable key={p.id} onPress={() => pick(p)}>
                <PlaceRow place={p} origin={coords} />
              </Pressable>
            ))}
            {filtered.length === 0 && <Text style={styles.emptyText}>No matches — try “park”, “trail”…</Text>}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  )
}

function StopRow({
  icon,
  label,
  stop,
  onPress,
  accent,
  placeholder,
}: {
  icon: string
  label: string
  stop: Stop
  onPress: () => void
  accent: string
  placeholder?: string
}) {
  return (
    <TouchableOpacity style={styles.stopRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.stopDot, { backgroundColor: accent }]}>
        <Text style={{ fontSize: 11 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stopLabel}>{label}</Text>
        <Text style={[styles.stopValue, !stop && { color: C.inkFaint }]} numberOfLines={1}>
          {stop ? stop.label : placeholder}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  stopsCard: { gap: 2, paddingVertical: 8, paddingHorizontal: 14 },
  dash: { width: 1.5, height: 14, backgroundColor: C.line, marginLeft: 27 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  stopDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stopLabel: { color: C.inkFaint, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  stopValue: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 1 },
  chevron: { color: C.inkFaint, fontSize: 22, fontWeight: '400' },
  profileBlurb: { color: C.inkFaint, fontSize: 12.5, marginTop: 8, paddingHorizontal: 4 },
  go: {
    marginTop: 14,
    backgroundColor: C.mint,
    borderRadius: R.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  goDisabled: { opacity: 0.4 },
  goText: { color: C.bgDeep, fontSize: 15.5, fontWeight: '800' },
  mapCard: { padding: 8 },
  mapCaption: { color: C.inkFaint, fontSize: 11, textAlign: 'center', marginTop: 4 },
  hazardCount: { color: C.inkFaint, fontSize: 12, fontWeight: '700' },
  footNote: { color: C.inkFaint, fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 17 },
  modalWrap: { flex: 1, backgroundColor: C.bg, paddingTop: 54 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  modalTitle: { color: C.ink, fontSize: 18, fontWeight: '800' },
  modalClose: { color: C.inkDim, fontSize: 20 },
  searchBox: { paddingHorizontal: 16 },
  searchInput: {
    backgroundColor: C.surface,
    borderRadius: R.m,
    color: C.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  useMyLocation: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: 'rgba(94,234,212,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.4)',
    borderRadius: R.m,
    paddingVertical: 12,
    alignItems: 'center',
  },
  useMyLocationText: { color: C.mint, fontSize: 14, fontWeight: '800' },
  emptyText: { color: C.inkFaint, textAlign: 'center', marginTop: 30, fontSize: 14 },
})
