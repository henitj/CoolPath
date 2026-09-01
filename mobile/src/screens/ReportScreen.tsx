import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { api, friendlyError } from '../api'
import { formatAgo, formatDistance, haversineM } from '../format'
import { useApp } from '../state'
import { C, R, SHADOW } from '../theme'

const CATEGORIES: { id: string; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { id: 'broken_sidewalk', label: 'Broken sidewalk', icon: 'broken-image' },
  { id: 'extreme_sun', label: 'No shade', icon: 'wb-sunny' },
  { id: 'unlit_area', label: 'Unlit area', icon: 'visibility-off' },
  { id: 'construction', label: 'Construction', icon: 'construction' },
  { id: 'blocked_path', label: 'Blocked path', icon: 'block' },
  { id: 'flooding', label: 'Flooding', icon: 'water-damage' },
]

/** A location-aware hazard report flow used by the map's bottom-left safety control. */
export default function ReportScreen() {
  const { coords, hazards, apiState, locationStatus, coverageNote, refreshLocation, refreshData, buzz } = useApp()
  const [category, setCategory] = useState<string | null>(null)
  const [severity, setSeverity] = useState(3)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const hasGPS = coords.ts > 0 && locationStatus === 'live'
  const inCoverage = coords.lon >= -97.755 && coords.lon <= -97.73 && coords.lat >= 30.26 && coords.lat <= 30.278
  const nearby = useMemo(() => hazards
    .map((hazard) => {
      const [lon, lat] = hazard.geometry.coordinates
      return { hazard, distance: haversineM(coords.lat, coords.lon, lat, lon) }
    })
    .filter((item) => item.distance < 2500)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 10), [coords.lat, coords.lon, hazards])

  const submit = async () => {
    if (!category) {
      setMessage('Choose the condition you spotted first.')
      return
    }
    if (!hasGPS || !inCoverage) {
      setMessage(hasGPS ? coverageNote : 'Calibrate phone GPS before placing a report.')
      return
    }
    if (apiState !== 'ok') {
      setMessage('Connect the CoolPath server in Profile before sending a report.')
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      await api.createHazard({ category, severity, note: note.trim(), lat: coords.lat, lon: coords.lon, reporter: 'coolpath-mobile' })
      setCategory(null)
      setSeverity(3)
      setNote('')
      setMessage('Report sent. Nearby route scores are updating now.')
      buzz('success')
      await refreshData()
    } catch (error) {
      setMessage(friendlyError(error))
      buzz('warn')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.heroIcon}><MaterialIcons name="report-problem" size={30} color={C.coral} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Report a walking condition</Text>
          <Text style={styles.subtitle}>Your report helps other walkers choose a better block.</Text>
        </View>
      </View>

      <View style={styles.locationCard}>
        <MaterialIcons name={hasGPS ? 'gps-fixed' : 'gps-not-fixed'} size={20} color={hasGPS ? C.mintDeep : C.amber} />
        <View style={{ flex: 1 }}>
          <Text style={styles.locationTitle}>{hasGPS ? 'Current report location ready' : 'Location calibration required'}</Text>
          <Text style={styles.locationCopy}>{hasGPS ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)} · Downtown Austin` : coverageNote}</Text>
        </View>
        {!hasGPS && <Pressable onPress={() => void refreshLocation()} accessibilityRole="button"><Text style={styles.calibrateLink}>Calibrate</Text></Pressable>}
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>What did you find?</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((item) => {
            const selected = category === item.id
            return (
              <Pressable key={item.id} style={[styles.category, selected && styles.categorySelected]} onPress={() => { setCategory(item.id); buzz() }} accessibilityRole="radio" accessibilityState={{ checked: selected }}>
                <MaterialIcons name={item.icon} size={21} color={selected ? '#FFFFFF' : C.mintDeep} />
                <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{item.label}</Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.fieldLabel}>Severity</Text>
        <View style={styles.severityRow}>
          {[1, 2, 3, 4, 5].map((value) => {
            const selected = severity === value
            return <Pressable key={value} style={[styles.severityButton, severity >= value && styles.severityOn, selected && styles.severitySelected]} onPress={() => setSeverity(value)} accessibilityRole="radio" accessibilityState={{ checked: selected }}><Text style={[styles.severityText, severity >= value && styles.severityTextOn]}>{value}</Text></Pressable>
          })}
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={280}
          placeholder="Optional detail, for example a blocked curb ramp"
          placeholderTextColor={C.inkFaint}
          style={styles.note}
          accessibilityLabel="Optional report details"
        />
        {message && <Text style={[styles.message, message.startsWith('Report sent') && styles.messageGood]}>{message}</Text>}
        <Pressable style={[styles.submit, submitting && styles.disabled]} onPress={() => void submit()} disabled={submitting} accessibilityRole="button">
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="send" size={19} color="#FFFFFF" />}
          <Text style={styles.submitText}>{submitting ? 'Sending report' : 'Send report'}</Text>
        </Pressable>
      </View>

      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>Nearby active reports</Text>
        <Text style={styles.listCount}>{nearby.length} shown</Text>
      </View>
      {nearby.length === 0 ? (
        <View style={styles.empty}><MaterialIcons name="check-circle-outline" size={25} color={C.mintDeep} /><Text style={styles.emptyText}>No active reports close to this map location.</Text></View>
      ) : nearby.map(({ hazard, distance: itemDistance }) => (
        <View key={hazard.properties.id} style={styles.hazardRow}>
          <View style={[styles.hazardStripe, { backgroundColor: hazard.properties.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hazardTitle}>{hazard.properties.label}</Text>
            <Text style={styles.hazardMeta}>{formatDistance(itemDistance)} away · {formatAgo(hazard.properties.age_hours)} · severity {hazard.properties.severity}</Text>
            {hazard.properties.note ? <Text style={styles.hazardNote} numberOfLines={2}>{hazard.properties.note}</Text> : null}
          </View>
          <MaterialIcons name="warning-amber" size={20} color={hazard.properties.color} />
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 38 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 17, padding: 14, borderRadius: R.xl, backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineSoft, ...SHADOW.card },
  heroIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.coralSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.35 },
  subtitle: { color: C.inkDim, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.mintSofter, padding: 12, borderRadius: R.l, marginBottom: 13 },
  locationTitle: { color: C.ink, fontSize: 12.5, fontWeight: '800' },
  locationCopy: { color: C.inkDim, fontSize: 10.8, marginTop: 2, lineHeight: 15 },
  calibrateLink: { color: C.mintDark, fontSize: 12, fontWeight: '800', padding: 4 },
  formCard: { backgroundColor: C.surface, padding: 15, borderRadius: R.xl, borderWidth: 1, borderColor: C.lineSoft, ...SHADOW.card },
  formTitle: { color: C.ink, fontSize: 17, fontWeight: '800', marginBottom: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { width: '48%', minHeight: 68, padding: 9, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surfaceHi, borderRadius: R.l, alignItems: 'center', justifyContent: 'center', gap: 4 },
  categorySelected: { backgroundColor: C.mintDeep, borderColor: C.mintDeep },
  categoryText: { color: C.inkDim, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  categoryTextSelected: { color: '#FFFFFF' },
  fieldLabel: { color: C.inkFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.75, textTransform: 'uppercase', marginTop: 16, marginBottom: 7 },
  severityRow: { flexDirection: 'row', gap: 8 },
  severityButton: { flex: 1, height: 42, borderRadius: R.m, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceHi },
  severityOn: { backgroundColor: C.amberSoft, borderColor: C.amberLine },
  severitySelected: { borderWidth: 2, borderColor: C.coral },
  severityText: { color: C.inkFaint, fontSize: 13, fontWeight: '800' },
  severityTextOn: { color: C.amber },
  note: { minHeight: 88, textAlignVertical: 'top', color: C.ink, fontSize: 13, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.lineSoft, borderRadius: R.m, padding: 11, marginTop: 14 },
  message: { color: C.coral, fontSize: 11.5, lineHeight: 16, fontWeight: '600', marginTop: 10 },
  messageGood: { color: C.mintDark },
  submit: { minHeight: 49, backgroundColor: C.mintDeep, borderRadius: R.m, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  listHeading: { marginTop: 22, marginBottom: 8, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { color: C.ink, fontSize: 15, fontWeight: '800' },
  listCount: { color: C.inkFaint, fontSize: 11.5, fontWeight: '700' },
  empty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: R.l, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface },
  emptyText: { color: C.inkDim, fontSize: 12.5, fontWeight: '600' },
  hazardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden', backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.lineSoft, paddingVertical: 11, paddingRight: 12, marginBottom: 8, ...SHADOW.card },
  hazardStripe: { width: 5, alignSelf: 'stretch' },
  hazardTitle: { color: C.ink, fontSize: 13, fontWeight: '800' },
  hazardMeta: { color: C.inkFaint, fontSize: 10.5, marginTop: 2 },
  hazardNote: { color: C.inkDim, fontSize: 11, lineHeight: 15, marginTop: 3 },
})
