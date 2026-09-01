import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { api, friendlyError } from '../api'
import WalkingMap, { asLatLng, type MapController } from '../components/WalkingMap'
import { formatDistance, formatMinutes } from '../format'
import { currentStep, routeProgress } from '../navigation'
import { useApp } from '../state'
import { C, R, SHADOW } from '../theme'
import type { RouteManeuver } from '../types'
import type { RoutePlan } from './MapScreen'

interface NavigationScreenProps {
  plan: RoutePlan | null
  onPlanChange: (plan: RoutePlan | null) => void
  onExitNavigation: () => void
}

function maneuverIcon(maneuver: RouteManeuver): keyof typeof MaterialIcons.glyphMap {
  switch (maneuver) {
    case 'turn-left': return 'turn-left'
    case 'turn-right': return 'turn-right'
    case 'slight-left': return 'subdirectory-arrow-left'
    case 'slight-right': return 'subdirectory-arrow-right'
    case 'u-turn': return 'u-turn-left'
    case 'arrive': return 'flag'
    case 'straight': return 'straight'
    default: return 'directions-walk'
  }
}

function durationText(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60))
  const remainder = Math.max(0, seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

/** Active walking state: follows GPS, exposes the next street maneuver, and logs the walk. */
export default function NavigationScreen({ plan, onPlanChange, onExitNavigation }: NavigationScreenProps) {
  const { coords, locationNote, locationStatus, activeWalk, stopWalk, routingPreferences, isWithinCoverage, buzz } = useApp()
  const mapRef = useRef<MapController | null>(null)
  const [showSteps, setShowSteps] = useState(false)
  const [rerouting, setRerouting] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [clock, setClock] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!plan) return
    const points = plan.route.geometry.coordinates.map(asLatLng)
    if (points.length >= 2) {
      setTimeout(() => mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 150, right: 50, bottom: 260, left: 50 },
        animated: true,
      }), 160)
    }
  }, [plan])

  useEffect(() => {
    if (!plan || coords.ts === 0) return
    mapRef.current?.animateCamera(
      {
        center: { latitude: coords.lat, longitude: coords.lon },
        heading: coords.heading ?? 0,
        pitch: 45,
        zoom: 18,
      },
      { duration: 700 },
    )
  }, [coords.heading, coords.lat, coords.lon, coords.ts, plan])

  const progress = useMemo(() => (plan && coords.ts > 0 ? routeProgress(plan.route.geometry.coordinates, coords) : null), [coords, plan])
  const steps = plan?.route.properties.steps ?? []
  const stepState = currentStep(steps, progress?.nearestIndex ?? 0)
  const nextStep = stepState?.step ?? null
  const remainingEta = plan && progress
    ? Math.max(0, (progress.remainingM / Math.max(plan.route.properties.metrics.distance_m, 1)) * plan.route.properties.metrics.est_walk_min)
    : 0
  const offRoute = Boolean(progress && progress.nearestDistanceM > Math.max(45, (coords.accuracy ?? 20) * 1.8))
  const trackedSeconds = activeWalk ? Math.max(0, Math.round((clock - new Date(activeWalk.startedAt).getTime()) / 1000)) : 0

  const finish = useCallback(async () => {
    await stopWalk()
    onExitNavigation()
  }, [onExitNavigation, stopWalk])

  const reroute = useCallback(async () => {
    if (!plan || coords.ts === 0 || !isWithinCoverage) {
      setRouteError('Rerouting requires a current Downtown Austin GPS fix.')
      return
    }
    setRerouting(true)
    setRouteError(null)
    try {
      const route = await api.route({
        origin: [coords.lon, coords.lat],
        destination: [plan.destination.lon, plan.destination.lat],
        profile: plan.route.properties.profile,
        avoid_red_paths: routingPreferences.avoidRedPaths,
        include_baseline: false,
      })
      const updated: RoutePlan = {
        route,
        origin: { id: 'phone-location', name: 'Current phone location', lat: coords.lat, lon: coords.lon },
        destination: plan.destination,
      }
      onPlanChange(updated)
      buzz('success')
    } catch (error) {
      setRouteError(friendlyError(error))
      buzz('warn')
    } finally {
      setRerouting(false)
    }
  }, [buzz, coords.lat, coords.lon, coords.ts, isWithinCoverage, onPlanChange, plan, routingPreferences.avoidRedPaths])

  if (!plan) {
    return (
      <View style={styles.emptyPage}>
        <View style={styles.emptyIcon}><MaterialIcons name="directions-walk" size={38} color={C.mintDeep} /></View>
        <Text style={styles.emptyTitle}>No walk in progress</Text>
        <Text style={styles.emptyCopy}>Plan a route on the map, then start walking to see live GPS progress and street-by-street directions.</Text>
        <Pressable style={styles.emptyButton} onPress={onExitNavigation} accessibilityRole="button">
          <Text style={styles.emptyButtonText}>Open map</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <WalkingMap
        onMapReady={(controller) => { mapRef.current = controller }}
        route={plan.route}
        origin={plan.origin}
        destination={plan.destination}
        followLocation
      />
      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View pointerEvents="auto" style={styles.topCard}>
          <View style={styles.nextIcon}><MaterialIcons name={maneuverIcon(nextStep?.maneuver ?? 'depart')} size={31} color="#FFFFFF" /></View>
          <View style={styles.nextCopy}>
            <Text style={styles.nextEyebrow}>{nextStep?.maneuver === 'arrive' ? 'Destination' : 'Next direction'}</Text>
            <Text style={styles.nextInstruction} numberOfLines={2}>{nextStep?.instruction ?? 'Follow the highlighted walking route'}</Text>
            {nextStep && nextStep.distance_m > 0 && <Text style={styles.nextMeta}>for {formatDistance(nextStep.distance_m)}</Text>}
          </View>
          <Pressable style={styles.recenter} onPress={() => mapRef.current?.animateToRegion({ latitude: coords.lat, longitude: coords.lon, latitudeDelta: 0.007, longitudeDelta: 0.007 }, 300)} accessibilityRole="button" accessibilityLabel="Center on current location">
            <MaterialIcons name="my-location" size={21} color={C.mintDeep} />
          </Pressable>
        </View>

        <View pointerEvents="auto" style={styles.bottomStack}>
          {offRoute && (
            <View style={styles.offRoute}>
              <MaterialIcons name="near-me-disabled" size={18} color={C.coral} />
              <View style={{ flex: 1 }}>
                <Text style={styles.offRouteTitle}>You are {formatDistance(progress?.nearestDistanceM ?? 0)} from the route</Text>
                <Text style={styles.offRouteCopy}>Use your current location to refresh directions.</Text>
              </View>
              <Pressable onPress={() => void reroute()} disabled={rerouting} accessibilityRole="button">
                {rerouting ? <ActivityIndicator color={C.coral} /> : <Text style={styles.rerouteText}>Reroute</Text>}
              </Pressable>
            </View>
          )}
          {routeError && <Text style={styles.routeError}>{routeError}</Text>}

          <View style={styles.progressCard}>
            <View style={styles.progressTopline}>
              <View>
                <Text style={styles.remainingEta}>{formatMinutes(remainingEta)}</Text>
                <Text style={styles.remainingMeta}>{formatDistance(progress?.remainingM ?? plan.route.properties.metrics.distance_m)} remaining</Text>
              </View>
              <View style={styles.trackStatus}>
                <MaterialIcons name={locationStatus === 'live' ? 'gps-fixed' : 'gps-not-fixed'} size={15} color={locationStatus === 'live' ? C.mintDeep : C.amber} />
                <Text style={styles.trackStatusText}>{locationStatus === 'live' ? 'GPS live' : locationNote}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(2, (progress?.progress ?? 0) * 100)}%` }]} />
            </View>
            <View style={styles.trackingRow}>
              <Text style={styles.trackingText}>Tracked {formatDistance(activeWalk?.distanceM ?? 0)} · {durationText(trackedSeconds)}</Text>
              <Text style={styles.trackingText}>{Math.round((progress?.progress ?? 0) * 100)}% route</Text>
            </View>

            <Pressable style={styles.stepsToggle} onPress={() => setShowSteps(!showSteps)} accessibilityRole="button" accessibilityState={{ expanded: showSteps }}>
              <View style={styles.stepsToggleTitle}><MaterialIcons name="format-list-numbered" size={19} color={C.mintDeep} /><Text style={styles.stepsToggleText}>Street directions</Text></View>
              <MaterialIcons name={showSteps ? 'expand-less' : 'expand-more'} size={23} color={C.inkDim} />
            </Pressable>
            {showSteps && (
              <ScrollView style={styles.stepsList} nestedScrollEnabled>
                {steps.map((step, index) => {
                  const isCurrent = index === stepState?.index
                  return (
                    <View key={`${step.coordinate_index}-${index}`} style={[styles.stepRow, isCurrent && styles.stepCurrent]}>
                      <View style={[styles.stepIcon, isCurrent && styles.stepIconCurrent]}><MaterialIcons name={maneuverIcon(step.maneuver)} size={18} color={isCurrent ? '#FFFFFF' : C.mintDeep} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stepInstruction, isCurrent && styles.stepInstructionCurrent]}>{step.instruction}</Text>
                        {step.distance_m > 0 && <Text style={styles.stepDistance}>{formatDistance(step.distance_m)} · {formatMinutes(step.duration_min)}</Text>}
                      </View>
                    </View>
                  )
                })}
              </ScrollView>
            )}
            <Pressable style={styles.endButton} onPress={() => void finish()} accessibilityRole="button">
              <MaterialIcons name="stop-circle" size={20} color={C.coral} />
              <Text style={styles.endButtonText}>End and save walk</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topCard: { marginTop: 8, marginHorizontal: 14, borderWidth: 1, borderColor: 'rgba(213,225,215,0.92)', backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: R.xl, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, ...SHADOW.floating },
  nextIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.mintDeep, alignItems: 'center', justifyContent: 'center' },
  nextCopy: { flex: 1, minWidth: 0 },
  nextEyebrow: { color: C.inkFaint, textTransform: 'uppercase', letterSpacing: 0.9, fontSize: 10, fontWeight: '800' },
  nextInstruction: { color: C.ink, fontSize: 15.5, fontWeight: '800', lineHeight: 20, marginTop: 3 },
  nextMeta: { color: C.inkDim, fontSize: 11.5, fontWeight: '600', marginTop: 3 },
  recenter: { width: 42, height: 42, backgroundColor: C.mintSoft, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  bottomStack: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  offRoute: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.amberSoft, borderRadius: R.l, borderWidth: 1, borderColor: C.amberLine, padding: 11, ...SHADOW.card },
  offRouteTitle: { color: C.ink, fontSize: 12, fontWeight: '800' },
  offRouteCopy: { color: C.inkDim, fontSize: 10.5, marginTop: 2 },
  rerouteText: { color: C.mintDark, fontSize: 12, fontWeight: '800' },
  routeError: { color: '#FFFFFF', backgroundColor: C.coral, borderRadius: R.m, padding: 10, fontSize: 12, fontWeight: '700' },
  progressCard: { borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface, borderRadius: R.xl, padding: 15, ...SHADOW.floating },
  progressTopline: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  remainingEta: { color: C.ink, fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.7 },
  remainingMeta: { color: C.inkDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  trackStatus: { maxWidth: '50%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.mintSofter, paddingHorizontal: 9, paddingVertical: 6, borderRadius: R.pill },
  trackStatusText: { color: C.inkDim, fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  progressTrack: { height: 8, borderRadius: R.pill, backgroundColor: C.mintSoft, marginTop: 13, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: R.pill, backgroundColor: C.mint },
  trackingRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  trackingText: { color: C.inkFaint, fontSize: 10.5, fontWeight: '700' },
  stepsToggle: { minHeight: 48, marginTop: 9, paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.lineSoft },
  stepsToggleTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepsToggleText: { color: C.ink, fontSize: 13.5, fontWeight: '800' },
  stepsList: { maxHeight: 220, marginBottom: 6 },
  stepRow: { flexDirection: 'row', gap: 10, paddingVertical: 9, paddingHorizontal: 7, borderRadius: R.m },
  stepCurrent: { backgroundColor: C.mintSofter },
  stepIcon: { width: 31, height: 31, borderRadius: 16, backgroundColor: C.mintSoft, alignItems: 'center', justifyContent: 'center' },
  stepIconCurrent: { backgroundColor: C.mintDeep },
  stepInstruction: { color: C.ink, fontSize: 12.5, lineHeight: 17, fontWeight: '700', paddingTop: 1 },
  stepInstructionCurrent: { color: C.mintDark },
  stepDistance: { color: C.inkFaint, fontSize: 10.5, marginTop: 2 },
  endButton: { minHeight: 46, marginTop: 4, borderRadius: R.m, borderWidth: 1, borderColor: C.coralLine, backgroundColor: C.coralSoft, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  endButtonText: { color: C.coral, fontSize: 13.5, fontWeight: '800' },
  emptyPage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, padding: 30, gap: 10 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: C.mintSoft },
  emptyTitle: { color: C.ink, fontSize: 22, fontWeight: '800', marginTop: 7, letterSpacing: -0.35 },
  emptyCopy: { color: C.inkDim, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 310 },
  emptyButton: { marginTop: 10, minHeight: 46, paddingHorizontal: 22, justifyContent: 'center', borderRadius: R.pill, backgroundColor: C.mintDeep },
  emptyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
})
