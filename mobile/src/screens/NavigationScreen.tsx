import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { api, friendlyError } from '../api'
import WalkingMap, { asLatLng, type MapController } from '../components/WalkingMap'
import { formatDistance, formatMinutes, haversineM } from '../format'
import { useApp } from '../state'
import { C, R, SHADOW } from '../theme'
import type { RouteManeuver, RouteStep } from '../types'
import type { RoutePlan } from './MapScreen'

interface NavigationScreenProps {
  plan: RoutePlan | null
  onPlanChange: (plan: RoutePlan | null) => void
  onExitNavigation: () => void
}

interface RouteProgress {
  nearestIndex: number
  nearestDistanceM: number
  remainingM: number
  progress: number
}

function routeProgress(plan: RoutePlan, point: { lat: number; lon: number }): RouteProgress {
  const line = plan.route.geometry.coordinates
  if (line.length < 2) return { nearestIndex: 0, nearestDistanceM: 0, remainingM: 0, progress: 0 }

  // Match against each *line segment*, not only route vertices. Downtown
  // blocks can be 80–150 m long, so nearest-vertex matching makes a walker
  // look off route halfway along a perfectly valid block.
  let travelled = 0
  let routeLength = 0
  const segmentLengths = line.slice(1).map(([lon, lat], index) => {
    const [priorLon, priorLat] = line[index]
    const length = haversineM(priorLat, priorLon, lat, lon)
    routeLength += length
    return length
  })
  let nearestIndex = 0
  let nearestDistanceM = Number.POSITIVE_INFINITY
  let distanceAlongRoute = 0
  const longitudeScale = 111_320 * Math.cos((point.lat * Math.PI) / 180)
  const latitudeScale = 110_540

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const [startLon, startLat] = line[index]
    const [endLon, endLat] = line[index + 1]
    const ax = (startLon - point.lon) * longitudeScale
    const ay = (startLat - point.lat) * latitudeScale
    const bx = (endLon - point.lon) * longitudeScale
    const by = (endLat - point.lat) * latitudeScale
    const dx = bx - ax
    const dy = by - ay
    const segmentSquared = dx * dx + dy * dy
    const fraction = segmentSquared > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / segmentSquared)) : 0
    const projectedX = ax + fraction * dx
    const projectedY = ay + fraction * dy
    const distance = Math.hypot(projectedX, projectedY)
    if (distance < nearestDistanceM) {
      nearestDistanceM = distance
      // Keep the current street maneuver visible until the walker is very
      // close to its next graph vertex, then advance to the next instruction.
      nearestIndex = fraction >= 0.92 ? index + 1 : index
      distanceAlongRoute = travelled + segmentLengths[index] * fraction
    }
    travelled += segmentLengths[index]
  }

  const remainingM = Math.max(0, routeLength - distanceAlongRoute)
  const measuredTotal = Math.max(routeLength, 1)
  return {
    nearestIndex,
    nearestDistanceM,
    remainingM,
    progress: Math.max(0, Math.min(1, 1 - remainingM / measuredTotal)),
  }
}

function currentStep(steps: RouteStep[], coordinateIndex: number): { step: RouteStep; index: number } | null {
  if (!steps.length) return null
  let candidate = 0
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index].coordinate_index <= coordinateIndex) candidate = index
    else break
  }
  return { step: steps[candidate], index: candidate }
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

  const progress = useMemo(() => (plan && coords.ts > 0 ? routeProgress(plan, coords) : null), [coords, plan])
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
  topCard: { marginTop: 8, marginHorizontal: 14, backgroundColor: C.surface, borderRadius: R.l, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, ...SHADOW.card },
  nextIcon: { width: 47, height: 47, borderRadius: 24, backgroundColor: C.mintDeep, alignItems: 'center', justifyContent: 'center' },
  nextCopy: { flex: 1, minWidth: 0 },
  nextEyebrow: { color: C.inkFaint, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10.5, fontWeight: '800' },
  nextInstruction: { color: C.ink, fontSize: 15.5, fontWeight: '800', lineHeight: 20, marginTop: 2 },
  nextMeta: { color: C.inkDim, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  recenter: { width: 39, height: 39, backgroundColor: '#E5F4E9', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bottomStack: { paddingHorizontal: 14, paddingBottom: 12, gap: 7 },
  offRoute: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF6ED', borderRadius: R.m, borderWidth: 1, borderColor: '#F1C695', padding: 10, ...SHADOW.card },
  offRouteTitle: { color: C.ink, fontSize: 12, fontWeight: '800' },
  offRouteCopy: { color: C.inkDim, fontSize: 10.5, marginTop: 1 },
  rerouteText: { color: C.coral, fontSize: 12, fontWeight: '800' },
  routeError: { color: '#FFFFFF', backgroundColor: C.coral, borderRadius: R.m, padding: 9, fontSize: 12, fontWeight: '700' },
  progressCard: { backgroundColor: C.surface, borderRadius: R.l, padding: 14, ...SHADOW.card },
  progressTopline: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  remainingEta: { color: C.ink, fontSize: 25, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5 },
  remainingMeta: { color: C.inkDim, fontSize: 12, fontWeight: '600', marginTop: 1 },
  trackStatus: { maxWidth: '50%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E9F6EC', paddingHorizontal: 8, paddingVertical: 5, borderRadius: R.pill },
  trackStatusText: { color: C.inkDim, fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#DBEADD', marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: C.mint },
  trackingRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  trackingText: { color: C.inkFaint, fontSize: 10.5, fontWeight: '700' },
  stepsToggle: { minHeight: 43, marginTop: 8, paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.lineSoft },
  stepsToggleTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stepsToggleText: { color: C.ink, fontSize: 13.5, fontWeight: '800' },
  stepsList: { maxHeight: 210, marginBottom: 5 },
  stepRow: { flexDirection: 'row', gap: 9, paddingVertical: 8, paddingHorizontal: 6, borderRadius: R.s },
  stepCurrent: { backgroundColor: '#E8F5EB' },
  stepIcon: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#E6F2E9', alignItems: 'center', justifyContent: 'center' },
  stepIconCurrent: { backgroundColor: C.mintDeep },
  stepInstruction: { color: C.ink, fontSize: 12.5, lineHeight: 17, fontWeight: '700', paddingTop: 1 },
  stepInstructionCurrent: { color: C.mintDeep },
  stepDistance: { color: C.inkFaint, fontSize: 10.5, marginTop: 2 },
  endButton: { minHeight: 43, marginTop: 3, borderRadius: R.m, borderWidth: 1, borderColor: '#EFB8B3', backgroundColor: '#FFF7F6', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  endButtonText: { color: C.coral, fontSize: 13.5, fontWeight: '800' },
  emptyPage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, padding: 30, gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DDF0E1' },
  emptyTitle: { color: C.ink, fontSize: 21, fontWeight: '800', marginTop: 6 },
  emptyCopy: { color: C.inkDim, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 310 },
  emptyButton: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: R.pill, backgroundColor: C.mintDeep },
  emptyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
})
