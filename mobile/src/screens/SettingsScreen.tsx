/**
 * Settings — connection doctor, units, haptics, about + data provenance.
 * Everything here must make the "it won't connect" moment painless.
 */
import React, { useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { useApp } from '../state'
import { useToast } from '../toast'
import { Card, SectionTitle } from '../components/Card'
import { Segmented } from '../components/Segmented'
import { C, R } from '../theme'

export default function SettingsScreen() {
  const {
    apiState,
    apiBase,
    apiOverride,
    setApiOverride,
    retryConnection,
    units,
    setUnits,
    hapticsOn,
    setHapticsOn,
    locationStatus,
    locationNote,
    refreshLocation,
    useDowntown,
    refreshData,
  } = useApp()
  const toast = useToast()
  const [draft, setDraft] = useState(apiOverride)
  const [testing, setTesting] = useState(false)

  const statusColor = apiState === 'ok' ? '#A7F3A0' : apiState === 'connecting' ? C.sun : C.coral
  const statusLabel = apiState === 'ok' ? 'Connected' : apiState === 'connecting' ? 'Connecting…' : 'Offline'

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionTitle>Connection</SectionTitle>
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>{statusLabel}</Text>
            <Text style={styles.apiUrl} numberOfLines={1}>
              {apiBase}
            </Text>
          </View>
          <Pressable
            onPress={async () => {
              setTesting(true)
              await retryConnection()
              setTesting(false)
            }}
            style={styles.testBtn}
            hitSlop={6}
          >
            <Text style={styles.testBtnText}>{testing ? '…' : 'Test'}</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Scanning the Expo QR code auto-detects this address (your computer's LAN IP). Change it
          only if the backend runs elsewhere.
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="http://192.168.1.20:8000"
            placeholderTextColor={C.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <Pressable
            style={styles.saveBtn}
            onPress={() => {
              setApiOverride(draft.trim() || null)
              toast(draft.trim() ? 'Address saved — reconnecting…' : 'Back to auto-detect', 'good')
              setTimeout(() => void retryConnection(), 250)
            }}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
        {apiOverride ? (
          <Pressable onPress={() => { setDraft(''); setApiOverride(null); toast('Using auto-detected address') }}>
            <Text style={styles.resetLink}>Reset to auto-detect</Text>
          </Pressable>
        ) : null}
      </Card>

      <SectionTitle>Location</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Text style={styles.bodyText}>{locationNote}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={styles.halfBtn} onPress={() => void refreshLocation()}>
            <Text style={styles.halfBtnText}>↻ Refresh GPS</Text>
          </Pressable>
          <Pressable style={styles.halfBtn} onPress={useDowntown}>
            <Text style={styles.halfBtnText}>📌 Anchor downtown</Text>
          </Pressable>
        </View>
      </Card>

      <SectionTitle>Preferences</SectionTitle>
      <Card style={{ gap: 14 }}>
        <View>
          <Text style={styles.prefLabel}>Temperature</Text>
          <Segmented
            options={[
              { value: 'F', label: '°F' },
              { value: 'C', label: '°C' },
            ]}
            value={units}
            onChange={(u) => setUnits(u as 'C' | 'F')}
          />
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.prefLabel}>Gentle haptics</Text>
            <Text style={styles.prefSub}>A soft tick when scores update or reports land</Text>
          </View>
          <Switch
            value={hapticsOn}
            onValueChange={setHapticsOn}
            trackColor={{ true: C.mintDeep, false: C.line }}
            thumbColor={C.ink}
          />
        </View>
        <Pressable
          onPress={() => {
            void refreshData()
            toast('Layers refreshed', 'good')
          }}
          style={[styles.halfBtn, { alignSelf: 'flex-start' }]}
        >
          <Text style={styles.halfBtnText}>↻ Refresh hazards & places</Text>
        </Pressable>
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Text style={styles.aboutTitle}>CoolPath 2.0 🌿</Text>
        <Text style={styles.aboutText}>
          Micro-climate walking companion for Downtown Austin. Surface heat from Landsat,
          greenery from Sentinel-2, building shadows from the real sun position, and hazards from
          walkers like you. When the live satellite feed is unavailable, CoolPath quietly falls
          back to the local street model — you always get scores.
        </Text>
        <Pressable onPress={() => Linking.openURL('https://github.com/henitj/CoolPath').catch(() => {})}>
          <Text style={styles.link}>github.com/henitj/CoolPath</Text>
        </Pressable>
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { color: C.ink, fontSize: 15, fontWeight: '800' },
  apiUrl: { color: C.inkFaint, fontSize: 12, marginTop: 1 },
  testBtn: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  testBtnText: { color: C.inkDim, fontSize: 12.5, fontWeight: '800' },
  hint: { color: C.inkFaint, fontSize: 12, lineHeight: 18 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: C.bgDeep,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: R.m,
    color: C.ink,
    fontSize: 13.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  saveBtn: { backgroundColor: C.mint, borderRadius: R.m, paddingHorizontal: 16, justifyContent: 'center' },
  saveBtnText: { color: C.bgDeep, fontWeight: '800', fontSize: 13.5 },
  resetLink: { color: C.mint, fontSize: 12.5, fontWeight: '700' },
  halfBtn: {
    backgroundColor: C.bgDeep,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: R.m,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
  },
  halfBtnText: { color: C.inkDim, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  prefLabel: { color: C.ink, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  prefSub: { color: C.inkFaint, fontSize: 11.5, marginBottom: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bodyText: { color: C.inkDim, fontSize: 13.5, lineHeight: 19 },
  aboutTitle: { color: C.ink, fontSize: 16, fontWeight: '800' },
  aboutText: { color: C.inkDim, fontSize: 12.5, lineHeight: 19 },
  link: { color: C.mint, fontSize: 12.5, fontWeight: '700', marginTop: 4 },
})
