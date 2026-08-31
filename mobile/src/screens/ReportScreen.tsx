/**
 * Report — crowdsourced hazards: browse what others flagged nearby and add
 * your own in three calm taps. Submissions update route scores immediately.
 */
import React, { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useApp } from '../state'
import { useToast } from '../toast'
import { api, friendlyError } from '../api'
import { Card, SectionTitle } from '../components/Card'
import { ErrorNotice } from '../components/Feedback'
import { hazardEmoji } from '../score'
import { formatAgo, formatDistance, haversineM } from '../format'
import { C, R } from '../theme'

const CATEGORIES = [
  { id: 'broken_sidewalk', label: 'Broken sidewalk' },
  { id: 'extreme_sun', label: 'No shade / blazing sun' },
  { id: 'unlit_area', label: 'Unlit at night' },
  { id: 'construction', label: 'Construction' },
  { id: 'blocked_path', label: 'Blocked path' },
  { id: 'flooding', label: 'Flooding' },
]

export default function ReportScreen() {
  const { coords, hazards, refreshData, buzz, apiState } = useApp()
  const toast = useToast()
  const [category, setCategory] = useState<string | null>(null)
  const [severity, setSeverity] = useState(3)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const sorted = useMemoSortHazards(hazards, coords.lat, coords.lon)

  const submit = useCallback(async () => {
    if (!category) {
      setError('Pick what you spotted first.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.createHazard({
        category,
        severity,
        note: note.trim(),
        lat: coords.lat,
        lon: coords.lon,
        reporter: 'coolpath-mobile',
      })
      buzz('success')
      setDone(true)
      setCategory(null)
      setSeverity(3)
      setNote('')
      toast('Thank you — nearby routes just got smarter 🌿', 'good')
      void refreshData()
      setTimeout(() => setDone(false), 2600)
    } catch (err) {
      buzz('warn')
      setError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }, [category, severity, note, coords, buzz, toast, refreshData])

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Card style={[styles.formCard, ...(done ? [styles.doneCard] : [])]}>
        {done ? (
          <View style={styles.doneWrap}>
            <Text style={{ fontSize: 34 }}>🌱</Text>
            <Text style={styles.doneTitle}>Report planted</Text>
            <Text style={styles.doneSub}>
              Walkers near you will see calmer, safer routes. Reports fade after about a week.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.formTitle}>Spot something on your walk?</Text>
            <Text style={styles.formSub}>
              Pin it at your current spot · {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
            </Text>

            <View style={styles.catGrid}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setCategory(c.id)
                    buzz()
                  }}
                  style={[styles.catBtn, category === c.id && styles.catBtnActive]}
                >
                  <Text style={{ fontSize: 19 }}>{hazardEmoji(c.id)}</Text>
                  <Text style={[styles.catLabel, category === c.id && styles.catLabelActive]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.severityLabel}>How bad is it?</Text>
            <View style={styles.sevRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} onPress={() => setSeverity(s)} hitSlop={6}>
                  <View style={[styles.sevDot, severity >= s && styles.sevDotOn, s === severity && styles.sevDotSelected]}>
                    <Text style={[styles.sevNum, severity >= s && styles.sevNumOn]}>{s}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Optional note — e.g. “loose gravel by the ramp”"
              placeholderTextColor={C.inkFaint}
              multiline
              maxLength={280}
              style={styles.noteInput}
            />

            {error && (
              <View style={{ marginTop: 10 }}>
                <ErrorNotice message={error} />
              </View>
            )}

            <Pressable
              style={[styles.submit, (!category || submitting) && styles.submitDisabled]}
              disabled={!category || submitting}
              onPress={() => void submit()}
            >
              <Text style={styles.submitText}>{submitting ? 'Planting…' : 'Submit report'}</Text>
            </Pressable>
            {apiState === 'down' && (
              <Text style={styles.queueNote}>Server offline — reports need a connection to sync.</Text>
            )}
          </>
        )}
      </Card>

      <SectionTitle right={<Text style={styles.count}>{sorted.length} active</Text>}>
        Nearby reports
      </SectionTitle>
      <View style={{ gap: 8 }}>
        {sorted.length === 0 && (
          <Text style={styles.empty}>Nothing reported nearby — the streets are calm. 🌿</Text>
        )}
        {sorted.slice(0, 12).map((h) => (
          <View key={h.key} style={styles.hazardRow}>
            <Text style={{ fontSize: 17 }}>{hazardEmoji(h.properties.category)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.hazardLabel}>{h.properties.label}</Text>
              <Text style={styles.hazardMeta} numberOfLines={1}>
                {formatDistance(h.dist)} away · {formatAgo(h.properties.age_hours)} · sev {h.properties.severity}
                {h.properties.note ? ` · “${h.properties.note}”` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function useMemoSortHazards(hazards: ReturnType<typeof useApp>['hazards'], lat: number, lon: number) {
  return React.useMemo(() => {
    return hazards
      .map((h) => {
        const [hLon, hLat] = h.geometry.coordinates
        return { ...h, key: String(h.properties.id), dist: haversineM(lat, lon, hLat, hLon) }
      })
      .filter((h) => h.dist < 3000)
      .sort((a, b) => a.dist - b.dist)
  }, [hazards, lat, lon])
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  formCard: { gap: 12 },
  doneCard: { borderColor: '#A7F3A0' },
  doneWrap: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  doneTitle: { color: C.ink, fontSize: 18, fontWeight: '800' },
  doneSub: { color: C.inkDim, fontSize: 13.5, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  formTitle: { color: C.ink, fontSize: 17, fontWeight: '800' },
  formSub: { color: C.inkFaint, fontSize: 12.5, marginTop: -6 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: {
    width: '31.5%',
    backgroundColor: C.bgDeep,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: R.m,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 3,
  },
  catBtnActive: { borderColor: C.mint, backgroundColor: 'rgba(94,234,212,0.1)' },
  catLabel: { color: C.inkDim, fontSize: 10.5, fontWeight: '700', textAlign: 'center', paddingHorizontal: 2 },
  catLabelActive: { color: C.mint },
  severityLabel: { color: C.inkFaint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  sevRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  sevDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.bgDeep,
    borderWidth: 1.5,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sevDotOn: { borderColor: C.sun, backgroundColor: 'rgba(252,211,77,0.12)' },
  sevDotSelected: { transform: [{ scale: 1.12 }], borderColor: C.mint },
  sevNum: { color: C.inkFaint, fontSize: 13, fontWeight: '800' },
  sevNumOn: { color: C.sun },
  noteInput: {
    backgroundColor: C.bgDeep,
    borderRadius: R.m,
    borderWidth: 1,
    borderColor: C.lineSoft,
    color: C.ink,
    fontSize: 14,
    padding: 12,
    minHeight: 66,
    textAlignVertical: 'top',
  },
  submit: { backgroundColor: C.mint, borderRadius: R.pill, paddingVertical: 14, alignItems: 'center' },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: C.bgDeep, fontSize: 15, fontWeight: '800' },
  queueNote: { color: C.inkFaint, fontSize: 11.5, textAlign: 'center' },
  count: { color: C.inkFaint, fontSize: 12, fontWeight: '700' },
  empty: { color: C.inkFaint, fontSize: 13.5, textAlign: 'center', paddingVertical: 16 },
  hazardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: R.m,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  hazardLabel: { color: C.ink, fontSize: 13.5, fontWeight: '700' },
  hazardMeta: { color: C.inkFaint, fontSize: 11.5, marginTop: 1 },
})
