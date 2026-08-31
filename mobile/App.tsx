/**
 * CoolPath — calm micro-climate walking companion.
 *
 * Tab shell: Home (now) · Route (compare) · Places · Report · Settings.
 * The logo in the header mirrors app state: it breathes with live data,
 * spins while scoring routes, and celebrates a planted report.
 */
import React, { useEffect, useState } from 'react'
import { StatusBar as ExpoStatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { AppProvider, useApp } from './src/state'
import { BusyProvider, useBusy } from './src/busy'
import { ToastProvider, useToast } from './src/toast'
import { ErrorBoundary } from './src/ErrorBoundary'
import CoolPathLogo, { LogoHalo } from './src/components/CoolPathLogo'
import HomeScreen from './src/screens/HomeScreen'
import RouteScreen from './src/screens/RouteScreen'
import PlacesScreen from './src/screens/PlacesScreen'
import ReportScreen from './src/screens/ReportScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import type { Place } from './src/types'
import { C, R } from './src/theme'

type TabId = 'home' | 'route' | 'places' | 'report' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Now' },
  { id: 'route', label: 'Route' },
  { id: 'places', label: 'Places' },
  { id: 'report', label: 'Report' },
  { id: 'settings', label: 'You' },
]

const TAB_ICONS: Record<TabId, string> = {
  home: '🌿',
  route: '🧭',
  places: '📍',
  report: '✋',
  settings: '⚙️',
}

function HeaderLogo() {
  const { apiState } = useApp()
  const { busy } = useBusy()
  const mood = busy ? 'busy' : apiState === 'ok' ? 'calm' : 'error'
  return <CoolPathLogo size={34} mood={mood} pulse={apiState === 'ok' && !busy} />
}

function Header() {
  const { apiState, locationStatus } = useApp()
  const statusText =
    apiState === 'connecting' ? 'Connecting…' : apiState === 'ok' ? (locationStatus === 'live' ? 'Live' : 'On the map') : 'Offline mode'
  const statusColor = apiState === 'ok' ? (locationStatus === 'live' ? '#A7F3A0' : '#FCD34D') : '#FB8A80'
  return (
    <View style={styles.header}>
      <HeaderLogo />
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>
          Cool<Text style={{ color: C.mint }}>Path</Text>
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusText} · downtown Austin</Text>
        </View>
      </View>
    </View>
  )
}

function Shell() {
  const [tab, setTab] = useState<TabId>('home')
  const [pendingDest, setPendingDest] = useState<Place | null>(null)
  const toast = useToast()
  const { coords } = useApp()

  const pickDestination = (p: Place) => {
    setPendingDest(p)
    setTab('route')
    toast(`${p.name} set as destination`, 'good')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header />
      <View style={styles.body}>
        {tab === 'home' && <HomeScreen onGoRouting={() => setTab('route')} />}
        {tab === 'route' && <RouteScreen key={pendingDest ? `d-${pendingDest.id}-${coords.lat.toFixed(4)}` : 'route'} initialTab={pendingDest ? 'destination' : null} />}
        {tab === 'places' && <PlacesScreen onPickDestination={pickDestination} />}
        {tab === 'report' && <ReportScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </View>
      <SafeAreaView edges={['bottom']} style={styles.tabSafe}>
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <TouchableOpacity
                key={t.id}
                style={styles.tab}
                onPress={() => setTab(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <LogoHalo active={active}>
                  <Text style={[styles.tabIcon, !active && { opacity: 0.55 }]}>{TAB_ICONS[t.id]}</Text>
                </LogoHalo>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  )
}

export default function App() {
  useEffect(() => {
    // Never let a stray async error take the app down.
    const defaultHandler = ErrorUtils?.getGlobalHandler?.()
    ErrorUtils?.setGlobalHandler?.((err, isFatal) => {
      console.warn('CoolPath global error:', err)
      if (!isFatal) return
      if (typeof defaultHandler === 'function') defaultHandler(err, isFatal)
    })
  }, [])

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppProvider>
          <BusyProvider>
            <ToastProvider>
              <ExpoStatusBar barStyle="light-content" backgroundColor={C.bg} />
              <Shell />
            </ToastProvider>
          </BusyProvider>
        </AppProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
    backgroundColor: C.bg,
  },
  headerTitle: { color: C.ink, fontSize: 21, fontWeight: '900', letterSpacing: 0.2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: C.inkFaint, fontSize: 11, fontWeight: '600' },
  body: { flex: 1, backgroundColor: C.bg },
  tabSafe: { backgroundColor: C.bg },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
    backgroundColor: C.bg,
    paddingTop: 8,
    paddingBottom: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon: { fontSize: 19 },
  tabLabel: { color: C.inkFaint, fontSize: 10.5, fontWeight: '700' },
  tabLabelActive: { color: C.mint },
})
