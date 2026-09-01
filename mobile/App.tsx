/**
 * CoolPath mobile: an Expo Go-compatible, map-first walking companion.
 * The map is the home screen; routes, navigation, reports, and profile all
 * share the same persisted GPS and routing state.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { AppProvider, useApp } from './src/state'
import { ErrorBoundary } from './src/ErrorBoundary'
import MapScreen, { type RoutePlan } from './src/screens/MapScreen'
import NavigationScreen from './src/screens/NavigationScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import ReportScreen from './src/screens/ReportScreen'
import { C, R, SHADOW } from './src/theme'

type TabId = 'map' | 'navigate' | 'report' | 'profile'

const TABS: { id: TabId; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'navigate', label: 'Navigate', icon: 'navigation' },
  { id: 'report', label: 'Report', icon: 'report-problem' },
  { id: 'profile', label: 'Profile', icon: 'account-circle' },
]

function Shell() {
  const [tab, setTab] = useState<TabId>('map')
  const [plan, setPlan] = useState<RoutePlan | null>(null)
  const { startWalk } = useApp()

  const startNavigation = useCallback(async (routePlan: RoutePlan) => {
    const started = await startWalk(routePlan.destination.name)
    if (started) {
      setPlan(routePlan)
      setTab('navigate')
    }
    return started
  }, [startWalk])

  const leaveNavigation = useCallback(() => setTab('map'), [])

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.body}>
        {tab === 'map' && <MapScreen plan={plan} onPlanChange={setPlan} onStartNavigation={startNavigation} onOpenReport={() => setTab('report')} />}
        {tab === 'navigate' && <NavigationScreen plan={plan} onPlanChange={setPlan} onExitNavigation={leaveNavigation} />}
        {tab === 'report' && <ReportScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </View>
      <SafeAreaView edges={['bottom']} style={styles.tabSafe}>
        <View style={styles.tabBar}>
          {TABS.map((item) => {
            const active = tab === item.id
            return (
              <Pressable
                key={item.id}
                style={styles.tab}
                onPress={() => setTab(item.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
                  <MaterialIcons name={item.icon} size={21} color={active ? C.mintDark : C.inkFaint} />
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  )
}

export default function App() {
  useEffect(() => {
    // Keep recoverable asynchronous errors visible in Metro logs without
    // replacing a usable map session with an opaque red screen.
    const defaultHandler = ErrorUtils?.getGlobalHandler?.()
    ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
      console.warn('CoolPath global error:', error)
      if (isFatal && typeof defaultHandler === 'function') defaultHandler(error, isFatal)
    })
  }, [])

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppProvider>
          <ExpoStatusBar style="dark" translucent backgroundColor="transparent" />
          <Shell />
        </AppProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, backgroundColor: C.bg },
  tabSafe: { backgroundColor: C.surface },
  tabBar: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.lineSoft,
    backgroundColor: C.surface,
    paddingTop: 7,
    paddingBottom: 6,
    ...SHADOW.card,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 53, justifyContent: 'center' },
  tabIconWrap: { width: 42, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: R.pill },
  tabIconWrapActive: { backgroundColor: C.mintSoft },
  tabLabel: { color: C.inkFaint, fontSize: 10.5, fontWeight: '700' },
  tabLabelActive: { color: C.mintDark, fontWeight: '800' },
})
