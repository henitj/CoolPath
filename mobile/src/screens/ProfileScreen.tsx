import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useApp } from '../state'
import { C, R, SHADOW } from '../theme'
import type { ProfileId, Units } from '../types'

const PROFILE_OPTIONS: { id: ProfileId; label: string; detail: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { id: 'cool', label: 'Cool', detail: 'Shade + distance', icon: 'park' },
  { id: 'safe', label: 'Care', detail: 'Walkability first', icon: 'verified-user' },
  { id: 'fastest', label: 'Direct', detail: 'Shortest time', icon: 'directions-walk' },
]

function historyDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Recent walk'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function duration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

function distance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`
  return `${Math.round(metres)} m`
}

/** History and reliability controls live together so GPS/routing choices are never hidden. */
export default function ProfileScreen() {
  const {
    apiState,
    apiBase,
    apiOverride,
    setApiOverride,
    retryConnection,
    routingPreferences,
    setAvoidRedPaths,
    setDefaultProfile,
    coords,
    locationStatus,
    locationNote,
    locationFixes,
    coverageNote,
    calibrateGps,
    activeWalk,
    walkHistory,
    clearWalkHistory,
    units,
    setUnits,
    hapticsOn,
    setHapticsOn,
  } = useApp()
  const [draft, setDraft] = useState(apiOverride)
  const [checking, setChecking] = useState(false)
  const [calibrating, setCalibrating] = useState(false)

  useEffect(() => setDraft(apiOverride), [apiOverride])

  const saveApi = async () => {
    setApiOverride(draft.trim() || null)
    setChecking(true)
    await retryConnection()
    setChecking(false)
  }

  const calibrate = async () => {
    setCalibrating(true)
    await calibrateGps()
    setCalibrating(false)
  }

  const connectionLabel = apiState === 'ok' ? 'Connected' : apiState === 'connecting' ? 'Checking connection' : 'Server unavailable'
  const connectionColor = apiState === 'ok' ? C.mint : apiState === 'connecting' ? C.amber : C.coral

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.avatar}><MaterialIcons name="person" size={31} color={C.mintDeep} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Your walking profile</Text>
          <Text style={styles.subtitle}>Routes, GPS calibration, and saved walks.</Text>
        </View>
      </View>

      <Section heading="Route choices" icon="alt-route">
        <Text style={styles.sectionCopy}>Cool is the default lowest-opportunity-cost route: it balances current shade against extra walking distance.</Text>
        <View style={styles.profileOptions}>
          {PROFILE_OPTIONS.map((option) => {
            const active = routingPreferences.defaultProfile === option.id
            return (
              <Pressable key={option.id} style={[styles.profileOption, active && styles.profileOptionActive]} onPress={() => setDefaultProfile(option.id)} accessibilityRole="radio" accessibilityState={{ checked: active }}>
                <MaterialIcons name={option.icon} size={19} color={active ? '#FFFFFF' : C.mintDeep} />
                <Text style={[styles.profileOptionLabel, active && styles.profileOptionActiveText]}>{option.label}</Text>
                <Text style={[styles.profileOptionDetail, active && styles.profileOptionActiveText]}>{option.detail}</Text>
              </Pressable>
            )
          })}
        </View>
        <SettingRow
          icon="block"
          title="Avoid poor red paths"
          detail="Use a clean mapped alternative before any poor-condition block."
          control={<Switch value={routingPreferences.avoidRedPaths} onValueChange={setAvoidRedPaths} trackColor={{ false: C.line, true: '#91CEA4' }} thumbColor={routingPreferences.avoidRedPaths ? C.mintDeep : '#FFFFFF'} />}
        />
      </Section>

      <Section heading="Phone GPS" icon="gps-fixed">
        <View style={styles.gpsStatus}>
          <View style={[styles.statusDot, { backgroundColor: locationStatus === 'live' ? C.mint : locationStatus === 'denied' ? C.coral : C.amber }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.gpsTitle}>{locationStatus === 'live' ? 'GPS is live' : 'GPS needs attention'}</Text>
            <Text style={styles.gpsCopy}>{locationNote}</Text>
          </View>
        </View>
        <View style={styles.gpsStats}>
          <Stat label="Accuracy" value={coords.accuracy != null ? `±${Math.round(coords.accuracy)} m` : 'Waiting'} />
          <Stat label="Live fixes" value={String(locationFixes)} />
          <Stat label="Coverage" value={coords.ts > 0 ? 'Checked' : 'Waiting'} />
        </View>
        <Text style={styles.coverageCopy}>{coverageNote}</Text>
        <Pressable style={[styles.calibrateButton, calibrating && styles.disabled]} onPress={() => void calibrate()} disabled={calibrating} accessibilityRole="button">
          {calibrating ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="my-location" size={20} color="#FFFFFF" />}
          <Text style={styles.calibrateText}>{calibrating ? 'Calibrating GPS' : 'Calibrate phone GPS'}</Text>
        </Pressable>
      </Section>

      <Section heading="Walk history" icon="history" right={walkHistory.length > 0 ? <Pressable onPress={clearWalkHistory} accessibilityRole="button"><Text style={styles.clearText}>Clear history</Text></Pressable> : undefined}>
        {activeWalk && (
          <View style={styles.activeWalk}>
            <MaterialIcons name="directions-walk" size={20} color={C.mintDeep} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeWalkTitle}>Walk tracking now</Text>
              <Text style={styles.activeWalkDetail}>{activeWalk.destination ? `Walking to ${activeWalk.destination}` : 'Foreground GPS is recording this walk'}</Text>
            </View>
            <Text style={styles.activeWalkDistance}>{distance(activeWalk.distanceM)}</Text>
          </View>
        )}
        {!activeWalk && walkHistory.length === 0 && (
          <View style={styles.emptyHistory}>
            <MaterialIcons name="directions-walk" size={26} color={C.inkFaint} />
            <Text style={styles.emptyHistoryTitle}>No saved walks yet</Text>
            <Text style={styles.emptyHistoryCopy}>Start walking from a route to record GPS distance and duration here.</Text>
          </View>
        )}
        {walkHistory.slice(0, 12).map((walk) => (
          <View key={walk.id} style={styles.walkRow}>
            <View style={styles.walkIcon}><MaterialIcons name="directions-walk" size={20} color={C.mintDeep} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.walkTitle}>{walk.destination ? `Walk to ${walk.destination}` : 'Tracked walk'}</Text>
              <Text style={styles.walkDetail}>{historyDate(walk.startedAt)} · {duration(walk.durationS)} · {walk.pointCount} GPS samples</Text>
            </View>
            <Text style={styles.walkDistance}>{distance(walk.distanceM)}</Text>
          </View>
        ))}
      </Section>

      <Section heading="App preferences" icon="tune">
        <SettingRow
          icon="thermostat"
          title="Temperature display"
          detail="Use the unit that is easiest to read while walking."
          control={
            <View style={styles.unitPicker}>
              {(['F', 'C'] as Units[]).map((value) => <Pressable key={value} onPress={() => setUnits(value)} style={[styles.unitButton, units === value && styles.unitButtonActive]} accessibilityRole="radio" accessibilityState={{ checked: units === value }}><Text style={[styles.unitText, units === value && styles.unitTextActive]}>°{value}</Text></Pressable>)}
            </View>
          }
        />
        <SettingRow
          icon="vibration"
          title="Haptic feedback"
          detail="Small confirmations for route and report actions."
          control={<Switch value={hapticsOn} onValueChange={setHapticsOn} trackColor={{ false: C.line, true: '#91CEA4' }} thumbColor={hapticsOn ? C.mintDeep : '#FFFFFF'} />}
        />
      </Section>

      <Section heading="Server connection" icon="lan">
        <View style={styles.connectionRow}>
          <View style={[styles.statusDot, { backgroundColor: connectionColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.connectionTitle}>{connectionLabel}</Text>
            <Text style={styles.connectionUrl} numberOfLines={1}>{apiBase}</Text>
          </View>
          {checking && <ActivityIndicator color={C.mintDeep} />}
        </View>
        <Text style={styles.connectionCopy}>When you scan the Expo Go QR on the same Wi-Fi as your computer, CoolPath automatically uses that computer’s port 8000 API. For a tunnel or deployed server, paste its full HTTPS address below.</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.x.x:8000"
          placeholderTextColor={C.inkFaint}
          style={styles.apiInput}
          accessibilityLabel="CoolPath API address"
        />
        <View style={styles.connectionActions}>
          <Pressable style={styles.secondaryButton} onPress={() => { setDraft(''); setApiOverride(null) }} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Use auto address</Text></Pressable>
          <Pressable style={[styles.primaryButton, checking && styles.disabled]} onPress={() => void saveApi()} disabled={checking} accessibilityRole="button"><Text style={styles.primaryButtonText}>Save and check</Text></Pressable>
        </View>
        {apiState === 'down' && <Text style={styles.helpText}>Make sure the backend is running with host 0.0.0.0, your firewall permits port 8000, and the phone is on the same network.</Text>}
      </Section>
    </ScrollView>
  )
}

function Section({ heading, icon, children, right }: { heading: string; icon: keyof typeof MaterialIcons.glyphMap; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}><MaterialIcons name={icon} size={18} color={C.mintDeep} /></View>
        <Text style={styles.sectionTitle}>{heading}</Text>
        <View style={{ marginLeft: 'auto' }}>{right}</View>
      </View>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

function SettingRow({ icon, title, detail, control }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; detail: string; control: React.ReactNode }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}><MaterialIcons name={icon} size={19} color={C.mintDeep} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDetail}>{detail}</Text>
      </View>
      {control}
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 38 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22, marginTop: 4, padding: 14, borderRadius: R.xl, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface, ...SHADOW.card },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.mintSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.45 },
  subtitle: { color: C.inkDim, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  section: { marginBottom: 21 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9, paddingHorizontal: 3 },
  sectionIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.mintSoft, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: '800' },
  sectionCard: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.lineSoft, padding: 14, ...SHADOW.card },
  sectionCopy: { color: C.inkDim, fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  profileOptions: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  profileOption: { flex: 1, alignItems: 'center', minHeight: 86, justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: C.lineSoft, borderRadius: R.l, backgroundColor: C.surfaceHi, paddingHorizontal: 4 },
  profileOptionActive: { backgroundColor: C.mintDeep, borderColor: C.mintDeep },
  profileOptionLabel: { color: C.ink, fontSize: 12, fontWeight: '800' },
  profileOptionDetail: { color: C.inkDim, fontSize: 9.5, textAlign: 'center', lineHeight: 13 },
  profileOptionActiveText: { color: '#FFFFFF' },
  settingRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingTop: 2 },
  settingIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.mintSofter },
  settingTitle: { color: C.ink, fontSize: 13.5, fontWeight: '800' },
  settingDetail: { color: C.inkDim, fontSize: 11.2, lineHeight: 16, marginTop: 2, paddingRight: 4 },
  gpsStatus: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.mintSofter, borderRadius: R.l, padding: 11 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  gpsTitle: { color: C.ink, fontSize: 13.5, fontWeight: '800' },
  gpsCopy: { color: C.inkDim, fontSize: 11.5, marginTop: 2 },
  gpsStats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, backgroundColor: C.surfaceMuted, borderRadius: R.m, paddingVertical: 9, alignItems: 'center' },
  statValue: { color: C.ink, fontSize: 13, fontWeight: '800' },
  statLabel: { color: C.inkFaint, fontSize: 9.5, marginTop: 2, fontWeight: '700', textTransform: 'uppercase' },
  coverageCopy: { color: C.inkDim, fontSize: 11.5, lineHeight: 16, marginTop: 11 },
  calibrateButton: { backgroundColor: C.mintDeep, borderRadius: R.m, minHeight: 48, marginTop: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  calibrateText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  clearText: { color: C.coral, fontSize: 12, fontWeight: '800' },
  activeWalk: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.l, backgroundColor: C.mintSofter, padding: 12, marginBottom: 9 },
  activeWalkTitle: { color: C.mintDark, fontSize: 13, fontWeight: '800' },
  activeWalkDetail: { color: C.inkDim, fontSize: 11, marginTop: 2 },
  activeWalkDistance: { color: C.mintDark, fontSize: 13, fontWeight: '800' },
  emptyHistory: { alignItems: 'center', paddingVertical: 19, gap: 6, backgroundColor: C.surfaceHi, borderRadius: R.l },
  emptyHistoryTitle: { color: C.ink, fontSize: 13.5, fontWeight: '800', marginTop: 2 },
  emptyHistoryCopy: { color: C.inkDim, fontSize: 11.5, lineHeight: 17, textAlign: 'center', maxWidth: 260 },
  walkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  walkIcon: { width: 37, height: 37, borderRadius: 19, backgroundColor: C.mintSoft, alignItems: 'center', justifyContent: 'center' },
  walkTitle: { color: C.ink, fontSize: 12.5, fontWeight: '800' },
  walkDetail: { color: C.inkFaint, fontSize: 10.5, marginTop: 2 },
  walkDistance: { color: C.mintDark, fontSize: 12.5, fontWeight: '800' },
  unitPicker: { flexDirection: 'row', backgroundColor: C.surfaceMuted, borderRadius: R.pill, padding: 3 },
  unitButton: { minWidth: 34, paddingHorizontal: 8, paddingVertical: 6, borderRadius: R.pill, alignItems: 'center' },
  unitButtonActive: { backgroundColor: C.mintDeep },
  unitText: { color: C.inkDim, fontSize: 11.5, fontWeight: '800' },
  unitTextActive: { color: '#FFFFFF' },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectionTitle: { color: C.ink, fontSize: 13.5, fontWeight: '800' },
  connectionUrl: { color: C.inkFaint, fontSize: 11, marginTop: 2 },
  connectionCopy: { color: C.inkDim, fontSize: 11.5, lineHeight: 17, marginTop: 11 },
  apiInput: { color: C.ink, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.line, borderRadius: R.m, paddingHorizontal: 12, paddingVertical: 12, fontSize: 13, marginTop: 11 },
  connectionActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  secondaryButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, borderRadius: R.m, backgroundColor: C.surfaceHi },
  secondaryButtonText: { color: C.mintDark, fontSize: 12.5, fontWeight: '800' },
  primaryButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: C.mintDeep, borderRadius: R.m },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  helpText: { color: C.coral, fontSize: 11.3, lineHeight: 16, fontWeight: '600', marginTop: 10 },
})
