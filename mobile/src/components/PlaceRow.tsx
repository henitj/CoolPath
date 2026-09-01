import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { C, R } from '../theme'
import { formatDistance, haversineM } from '../format'
import type { Place } from '../types'

export default function PlaceRow({
  place,
  comfort,
  temp,
  shade,
  loading,
  origin,
  saved,
  onPress,
}: {
  place: Place
  comfort?: number
  temp?: string
  shade?: number
  loading?: boolean
  origin?: { lat: number; lon: number } | null
  saved?: boolean
  onPress?: () => void
}) {
  const dist =
    origin != null
      ? formatDistance(haversineM(origin.lat, origin.lon, place.lat, place.lon))
      : null
  const comfortColor =
    comfort == null ? C.inkFaint : comfort >= 65 ? C.mint : comfort >= 45 ? '#A7F3A0' : comfort >= 28 ? C.sun : C.coral

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.name} numberOfLines={1}>
            {place.name}
          </Text>
          {saved && <Text style={styles.savedLabel}>Saved</Text>}
        </View>
        <Text style={styles.blurb} numberOfLines={1}>
          {place.blurb}
          {dist ? ` · ${dist} away` : ''}
        </Text>
      </View>
      <View style={styles.scoreBox}>
        {loading ? (
          <Text style={styles.loadingText}>…</Text>
        ) : (
          <>
            <Text style={[styles.score, { color: comfortColor }]}>{comfort != null ? Math.round(comfort) : '—'}</Text>
            <Text style={styles.scoreSub}>
              {temp ? `${temp}` : shade != null ? `${Math.round(shade)}% shade` : ''}
            </Text>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: R.m,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  name: { color: C.ink, fontSize: 14.5, fontWeight: '700', flexShrink: 1 },
  savedLabel: { color: C.mintDeep, fontSize: 10, fontWeight: '800' },
  blurb: { color: C.inkFaint, fontSize: 12, marginTop: 1 },
  scoreBox: { alignItems: 'flex-end', minWidth: 52 },
  score: { fontSize: 19, fontWeight: '800' },
  scoreSub: { color: C.inkFaint, fontSize: 10.5, fontWeight: '600' },
  loadingText: { color: C.inkFaint, fontSize: 16 },
})
