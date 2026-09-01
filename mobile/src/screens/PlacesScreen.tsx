/**
 * Places — every curated spot scored for *right now*, sorted coolest first.
 * Search, save favourites, tap to route.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useApp } from '../state'
import { useBusy } from '../busy'
import { api } from '../api'
import { STORAGE_KEYS } from '../config'
import PlaceRow from '../components/PlaceRow'
import { SectionTitle } from '../components/Card'
import { LoadingDots } from '../components/Feedback'
import { filterPlaces } from '../places'
import { formatTempUnit } from '../format'
import type { NowConditions, Place, Units } from '../types'
import { C, R } from '../theme'

interface Scored {
  place: Place
  now: NowConditions | null
}

export default function PlacesScreen({ onPickDestination }: { onPickDestination: (p: Place) => void }) {
  const { places, units, apiState } = useApp()
  const busy = useBusy()
  const [query, setQuery] = useState('')
  const [scored, setScored] = useState<Scored[]>([])
  const [scanning, setScanning] = useState(true)
  const [saved, setSaved] = useState<string[]>([])
  const alive = useRef(true)

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.savedPlaces).catch(() => null)
      if (raw) {
        try {
          setSaved(JSON.parse(raw) as string[])
        } catch {
          /* ignore corrupt data */
        }
      }
    })()
  }, [])

  const toggleSave = useCallback(async (id: string) => {
    setSaved((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      void AsyncStorage.setItem(STORAGE_KEYS.savedPlaces, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  useEffect(() => {
    alive.current = true
    setScanning(true)
    busy.start()
    void (async () => {
      // score places in gentle batches so the server (and UI) stay calm
      const initial = places.map((place) => ({ place, now: null as NowConditions | null }))
      setScored(initial)
      const BATCH = 4
      for (let i = 0; i < places.length; i += BATCH) {
        if (!alive.current) return
        const batch = places.slice(i, i + BATCH)
        const results = await Promise.allSettled(
          batch.map((p) => api.now(p.lat, p.lon)),
        )
        if (!alive.current) return
        setScored((prev) => {
          const next = [...prev]
          results.forEach((res, j) => {
            const idx = next.findIndex((s) => s.place.id === batch[j].id)
            if (idx >= 0 && res.status === 'fulfilled') next[idx] = { place: batch[j], now: res.value }
          })
          return next
        })
      }
      if (alive.current) {
        setScanning(false)
        busy.stop()
      }
    })()
    return () => {
      alive.current = false
      busy.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places])

  const sorted = useMemo(() => {
    const arr = [...scored]
    arr.sort((a, b) => {
      if (a.now && b.now) return b.now.comfort - a.now.comfort
      if (a.now) return -1
      if (b.now) return 1
      return 0
    })
    return arr
  }, [scored])

  const filtered = useMemo(() => filterPlaces(sorted.map((s) => s.place), query), [sorted, query])
  const visible = sorted.filter((s) => filtered.some((f) => f.id === s.place.id))

  const coolest = sorted.find((s) => s.now)?.now

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search parks, trails, districts…"
          placeholderTextColor={C.inkFaint}
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.clear}>×</Text>
          </Pressable>
        )}
      </View>

      {coolest && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            Coolest right now: <Text style={{ color: C.mint }}>{Math.round(coolest.comfort)} comfort</Text>
          </Text>
          <Text style={styles.summarySub}>
            {formatTempUnit(coolest.temp_c, units)} surface · {Math.round(coolest.shade_pct)}% shade — green rows are your best bets
          </Text>
        </View>
      )}

      {apiState === 'down' && (
        <Text style={styles.offlineNote}>
          Server offline — showing the saved catalogue without live scores.
        </Text>
      )}

      <SectionTitle right={scanning ? <LoadingDots /> : <Text style={styles.count}>{visible.length} places</Text>}>
        {query ? 'Matches' : 'Scored for now'}
      </SectionTitle>

      <View style={{ gap: 10 }}>
        {visible.map(({ place, now }) => (
          <View key={place.id}>
            <Pressable onPress={() => onPickDestination(place)}>
              <PlaceRow
                place={place}
                comfort={now?.comfort}
                temp={now ? formatTempUnit(now.temp_c, units) : undefined}
                shade={now?.shade_pct}
                loading={!now}
                saved={saved.includes(place.id)}
              />
            </Pressable>
            <Pressable style={styles.heart} onPress={() => void toggleSave(place.id)} hitSlop={8}>
              <Text style={styles.saveText}>{saved.includes(place.id) ? 'Saved' : 'Save'}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.m,
    borderWidth: 1,
    borderColor: C.lineSoft,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: C.ink, fontSize: 15, paddingVertical: 13 },
  clear: { color: C.inkFaint, fontSize: 16, paddingLeft: 8 },
  summaryCard: {
    marginTop: 12,
    backgroundColor: 'rgba(94,234,212,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.3)',
    borderRadius: R.m,
    padding: 14,
  },
  summaryTitle: { color: C.ink, fontSize: 14.5, fontWeight: '800' },
  summarySub: { color: C.inkDim, fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  offlineNote: { color: C.inkFaint, fontSize: 12.5, marginTop: 12, textAlign: 'center' },
  count: { color: C.inkFaint, fontSize: 12, fontWeight: '700' },
  heart: { position: 'absolute', right: 10, top: 10, padding: 4 },
  saveText: { color: C.mintDeep, fontSize: 10.5, fontWeight: '800' },
})
