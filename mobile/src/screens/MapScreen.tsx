import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { api, friendlyError } from '../api'
import PlacePicker from '../components/PlacePicker'
import WalkingMap, { asLatLng, type MapController, type MapLongPressEvent, type MapStop } from '../components/WalkingMap'
import { formatDistance, formatMinutes } from '../format'
import { useApp } from '../state'
import { C, R, SHADOW } from '../theme'
import type { ProfileId, RoadConditionFeature, RouteResponse } from '../types'

export interface RoutePlan {
  route: RouteResponse
  origin: MapStop
  destination: MapStop
}

interface MapScreenProps {
  plan: RoutePlan | null
  onPlanChange: (plan: RoutePlan | null) => void
  onStartNavigation: (plan: RoutePlan) => Promise<boolean>
  onOpenReport: () => void
}

const PROFILE_COPY: Record<ProfileId, { title: string; detail: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  cool: { title: 'Cool route', detail: 'Best shade-distance value', icon: 'park' },
  safe: { title: 'Care route', detail: 'Prioritizes walkability', icon: 'verified-user' },
  fastest: { title: 'Direct route', detail: 'Shortest walk time', icon: 'directions-walk' },
}

function mapStopFromPlace(place: { id: string; name: string; lat: number; lon: number }): MapStop {
  return { id: place.id, name: place.name, lat: place.lat, lon: place.lon }
}

function pinStop(kind: 'origin' | 'destination', coordinate: { latitude: number; longitude: number }): MapStop {
  return {
    id: `${kind}-pin-${coordinate.latitude.toFixed(6)}-${coordinate.longitude.toFixed(6)}`,
    name: kind === 'origin' ? 'Pinned start' : 'Pinned destination',
    lat: coordinate.latitude,
    lon: coordinate.longitude,
  }
}

/** Google Maps-like home canvas with real native map tiles and live road colors. */
export default function MapScreen({ plan, onPlanChange, onStartNavigation, onOpenReport }: MapScreenProps) {
  const {
    apiState,
    coords,
    locationStatus,
    locationNote,
    isWithinCoverage,
    coverageNote,
    places,
    hazards,
    routingPreferences,
    setAvoidRedPaths,
    refreshLocation,
    buzz,
  } = useApp()
  const mapRef = useRef<MapController | null>(null)
  const [origin, setOrigin] = useState<MapStop | null>(plan?.origin ?? null)
  const [destination, setDestination] = useState<MapStop | null>(plan?.destination ?? null)
  const [picker, setPicker] = useState<'origin' | 'destination' | null>(null)
  const [pinMode, setPinMode] = useState<'origin' | 'destination'>('destination')
  const [profile, setProfile] = useState<ProfileId>(plan?.route.properties.profile ?? routingPreferences.defaultProfile)
  const [roads, setRoads] = useState<RoadConditionFeature[]>([])
  const [roadsNote, setRoadsNote] = useState('Loading live road conditions')
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routing, setRouting] = useState(false)
  const [starting, setStarting] = useState(false)

  const currentStart = useMemo<MapStop | null>(() => {
    if (origin) return origin
    if (coords.ts <= 0) return null
    return { id: 'phone-location', name: 'Current phone location', lat: coords.lat, lon: coords.lon }
  }, [coords.lat, coords.lon, coords.ts, origin])

  useEffect(() => {
    if (plan) {
      setOrigin(plan.origin)
      setDestination(plan.destination)
      setProfile(plan.route.properties.profile)
    }
  }, [plan])

  const loadRoadConditions = useCallback(async () => {
    try {
      const response = await api.roadConditions()
      setRoads(Array.isArray(response.features) ? response.features.slice(0, 700) : [])
      setRoadsNote('Live road conditions')
    } catch {
      setRoads([])
      setRoadsNote(apiState === 'down' ? 'Road layer needs a server connection' : 'Road layer temporarily unavailable')
    }
  }, [apiState])

  useEffect(() => {
    if (apiState !== 'ok') {
      setRoads([])
      setRoadsNote('Road layer needs a server connection')
      return
    }
    void loadRoadConditions()
    const interval = setInterval(() => void loadRoadConditions(), 45_000)
    return () => clearInterval(interval)
  }, [apiState, loadRoadConditions])

  const fitRoute = useCallback((route: RouteResponse) => {
    const points = route.geometry.coordinates.map(asLatLng)
    if (points.length < 2) return
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 150, right: 56, bottom: 250, left: 56 },
        animated: true,
      })
    }, 180)
  }, [])

  const chooseStop = useCallback(
    (kind: 'origin' | 'destination', stop: MapStop) => {
      if (kind === 'origin') setOrigin(stop)
      else setDestination(stop)
      setPinMode(kind === 'origin' ? 'destination' : 'origin')
      setRouteError(null)
      onPlanChange(null)
      mapRef.current?.animateToRegion(
        { latitude: stop.lat, longitude: stop.lon, latitudeDelta: 0.009, longitudeDelta: 0.009 },
        420,
      )
      buzz()
    },
    [buzz, onPlanChange],
  )

  const onMapLongPress = useCallback(
    (event: MapLongPressEvent) => {
      // Respect the stop the person explicitly selected. Before a phone fix
      // exists, recover gracefully by using the first dropped pin as start.
      const kind = currentStart ? pinMode : 'origin'
      chooseStop(kind, pinStop(kind, event.nativeEvent.coordinate))
    },
    [chooseStop, currentStart, pinMode],
  )

  const createRoute = useCallback(async () => {
    const start = currentStart
    if (!start) {
      setRouteError('Set a downtown start point or allow phone location before routing.')
      setPicker('origin')
      return
    }
    if (!destination) {
      setRouteError('Choose a destination to get walking directions.')
      setPicker('destination')
      return
    }
    if (!origin && !isWithinCoverage) {
      setRouteError(coverageNote)
      return
    }
    if (apiState !== 'ok') {
      setRouteError('Connect the CoolPath server in Profile before creating a route.')
      return
    }
    setRouting(true)
    setRouteError(null)
    try {
      const route = await api.route({
        origin: [start.lon, start.lat],
        destination: [destination.lon, destination.lat],
        profile,
        avoid_red_paths: routingPreferences.avoidRedPaths,
        include_baseline: true,
      })
      const nextPlan = { route, origin: start, destination }
      onPlanChange(nextPlan)
      fitRoute(route)
      buzz('success')
    } catch (error) {
      setRouteError(friendlyError(error))
      buzz('warn')
    } finally {
      setRouting(false)
    }
  }, [apiState, buzz, coverageNote, currentStart, destination, fitRoute, isWithinCoverage, onPlanChange, origin, profile, routingPreferences.avoidRedPaths])

  const beginNavigation = useCallback(async () => {
    if (!plan) return
    setStarting(true)
    const started = await onStartNavigation(plan)
    if (!started) setRouteError('A current GPS fix is needed to start walk tracking. Calibrate GPS and try again.')
    setStarting(false)
  }, [onStartNavigation, plan])

  const useLiveLocation = useCallback(() => {
    setOrigin(null)
    setPinMode('destination')
    setRouteError(null)
    onPlanChange(null)
    void refreshLocation()
    setPicker(null)
  }, [onPlanChange, refreshLocation])

  const activePlan = plan
  const eta = activePlan?.route.properties.metrics.est_walk_min
  const comfort = activePlan?.route.properties.metrics.comfort_score

  return (
    <View style={styles.page}>
      <WalkingMap
        onMapReady={(controller) => { mapRef.current = controller }}
        route={activePlan?.route}
        baseline={activePlan?.route.baseline}
        roadConditions={roads}
        hazards={hazards}
        origin={currentStart}
        destination={destination}
        onLongPress={onMapLongPress}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View pointerEvents="auto" style={styles.topStack}>
          <View style={styles.searchCard}>
            <View style={styles.plannerHeader}>
              <View style={styles.plannerIcon}>
                <MaterialIcons name="directions-walk" size={18} color={C.mintDark} />
              </View>
              <View style={styles.plannerCopy}>
                <Text style={styles.plannerTitle}>Plan your walk</Text>
                <Text style={styles.plannerSubtitle}>Comfort-aware directions</Text>
              </View>
              <View style={styles.coverageBadge}>
                <Text style={styles.coverageBadgeText}>Downtown</Text>
              </View>
            </View>
            <View style={styles.stopsList}>
              <Pressable
                style={styles.stopRow}
                onPress={() => { setPinMode('origin'); setPicker('origin') }}
                accessibilityRole="button"
                accessibilityLabel="Choose starting point"
              >
                <View style={styles.originDot} />
                <View style={styles.stopCopy}>
                  <Text style={styles.stopLabel}>From</Text>
                  <Text style={styles.stopValue} numberOfLines={1}>{currentStart?.name ?? 'Set a start'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={C.inkFaint} />
              </Pressable>
              <View style={styles.connector} />
              <Pressable
                style={styles.stopRow}
                onPress={() => { setPinMode('destination'); setPicker('destination') }}
                accessibilityRole="button"
                accessibilityLabel="Choose destination"
              >
                <View style={styles.destinationIcon}>
                  <MaterialIcons name="place" size={17} color={C.coral} />
                </View>
                <View style={styles.stopCopy}>
                  <Text style={styles.stopLabel}>To</Text>
                  <Text style={styles.stopValue} numberOfLines={1}>{destination?.name ?? 'Where to?'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={C.inkFaint} />
              </Pressable>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusPill}>
              <MaterialIcons name={locationStatus === 'live' ? 'gps-fixed' : 'gps-not-fixed'} size={15} color={locationStatus === 'live' ? C.mintDeep : C.amber} />
              <Text style={styles.statusText} numberOfLines={1}>{locationStatus === 'live' ? locationNote : 'GPS calibrating'}</Text>
            </View>
            <Pressable
              style={styles.myLocationButton}
              onPress={() => {
                void refreshLocation()
                mapRef.current?.animateToRegion({ latitude: coords.lat, longitude: coords.lon, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 350)
              }}
              accessibilityRole="button"
              accessibilityLabel="Calibrate and center phone location"
            >
              <MaterialIcons name="my-location" size={21} color={C.mintDeep} />
            </Pressable>
          </View>
        </View>

        <View pointerEvents="auto" style={styles.floatingLeft}>
          <Pressable style={styles.hazardButton} onPress={onOpenReport} accessibilityRole="button" accessibilityLabel="Report a walking hazard">
            <MaterialIcons name="report-problem" size={22} color="#FFFFFF" />
            <Text style={styles.hazardText}>Report</Text>
          </Pressable>
        </View>

        <View pointerEvents="auto" style={styles.bottomArea}>
          <View style={styles.layerLegend}>
            <View style={styles.legendHeading}>
              <MaterialIcons name="timeline" size={15} color={C.inkDim} />
              <Text style={styles.legendLabel}>{roadsNote}</Text>
            </View>
            <View style={styles.legendScale}>
              <Legend color="#15803D" label="Good" />
              <Legend color="#65A30D" label="Fair" />
              <Legend color="#F59E0B" label="Care" />
              <Legend color="#DC2626" label="Poor" />
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileRow}>
            {(Object.keys(PROFILE_COPY) as ProfileId[]).map((id) => {
              const item = PROFILE_COPY[id]
              const selected = profile === id
              return (
                <Pressable
                  key={id}
                  onPress={() => { setProfile(id); onPlanChange(null); buzz() }}
                  style={[styles.profileChip, selected && styles.profileChipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${item.title}`}
                  accessibilityState={{ selected }}
                >
                  <MaterialIcons name={item.icon} size={17} color={selected ? '#FFFFFF' : C.mintDeep} />
                  <View>
                    <Text style={[styles.profileTitle, selected && styles.profileTextActive]}>{item.title}</Text>
                    <Text style={[styles.profileDetail, selected && styles.profileTextActive]}>{item.detail}</Text>
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>

          <Pressable
            onPress={() => setAvoidRedPaths(!routingPreferences.avoidRedPaths)}
            style={[styles.avoidToggle, routingPreferences.avoidRedPaths && styles.avoidToggleOn]}
            accessibilityRole="switch"
            accessibilityLabel="Avoid poor red paths"
            accessibilityState={{ checked: routingPreferences.avoidRedPaths }}
          >
            <MaterialIcons name="block" size={17} color={routingPreferences.avoidRedPaths ? C.coral : C.inkDim} />
            <Text style={styles.avoidText}>{routingPreferences.avoidRedPaths ? 'Avoid poor red paths' : 'Allow poor paths when needed'}</Text>
            <MaterialIcons name={routingPreferences.avoidRedPaths ? 'toggle-on' : 'toggle-off'} size={25} color={routingPreferences.avoidRedPaths ? C.coral : C.inkFaint} />
          </Pressable>

          {activePlan ? (
            <View style={styles.routeCard}>
              <View style={styles.routeTopline}>
                <View style={styles.etaBlock}>
                  <Text style={styles.eta}>{formatMinutes(eta ?? 0)}</Text>
                  <Text style={styles.routeMeta}>{formatDistance(activePlan.route.properties.metrics.distance_m)} · score {Math.round(comfort ?? 0)}</Text>
                </View>
                <Pressable onPress={() => onPlanChange(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear route">
                  <MaterialIcons name="close" size={22} color={C.inkDim} />
                </Pressable>
              </View>
              <Text style={styles.destinationText} numberOfLines={1}>Walking to {activePlan.destination.name}</Text>
              {activePlan.route.properties.warnings?.slice(0, 1).map((warning) => (
                <Text key={warning} style={styles.warningText}>{warning}</Text>
              ))}
              <Pressable style={[styles.startButton, starting && styles.buttonDisabled]} onPress={() => void beginNavigation()} disabled={starting} accessibilityRole="button">
                {starting ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="navigation" size={20} color="#FFFFFF" />}
                <Text style={styles.startButtonText}>{starting ? 'Calibrating GPS' : 'Start walking'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.routeCard}>
              <Text style={styles.planTitle}>Plan a shade-aware walk</Text>
              <Text style={styles.planCopy}>Cool route minimizes walking opportunity cost by balancing live shade and distance.</Text>
              {routeError && <Text style={styles.errorText}>{routeError}</Text>}
              {!routeError && !isWithinCoverage && coords.ts > 0 && <Text style={styles.errorText}>{coverageNote}</Text>}
              <Pressable style={[styles.routeButton, routing && styles.buttonDisabled]} onPress={() => void createRoute()} disabled={routing} accessibilityRole="button">
                {routing ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="directions-walk" size={20} color="#FFFFFF" />}
                <Text style={styles.routeButtonText}>{routing ? 'Finding best walk' : 'Find walking route'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>

      <PlacePicker
        visible={picker !== null}
        kind={picker ?? 'destination'}
        places={places}
        onClose={() => setPicker(null)}
        onSelect={(place) => chooseStop(picker ?? 'destination', mapStopFromPlace(place))}
        onUseLocation={picker === 'origin' ? useLiveLocation : undefined}
      />
    </View>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendLine, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topStack: { paddingHorizontal: 14, paddingTop: 8, gap: 9 },
  searchCard: {
    borderWidth: 1,
    borderColor: 'rgba(213, 225, 215, 0.92)',
    borderRadius: R.xl,
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 10,
    ...SHADOW.floating,
  },
  plannerHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4, paddingBottom: 8 },
  plannerIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.mintSoft },
  plannerCopy: { flex: 1 },
  plannerTitle: { color: C.ink, fontSize: 13.5, fontWeight: '800', letterSpacing: -0.1 },
  plannerSubtitle: { color: C.inkFaint, fontSize: 10.5, fontWeight: '600', marginTop: 1 },
  coverageBadge: { borderRadius: R.pill, backgroundColor: C.surfaceMuted, paddingHorizontal: 9, paddingVertical: 5 },
  coverageBadgeText: { color: C.mintDark, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.25 },
  stopsList: { position: 'relative', borderRadius: R.l, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.lineSoft, overflow: 'hidden' },
  stopRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12 },
  originDot: { width: 14, height: 14, borderRadius: 7, marginHorizontal: 3, backgroundColor: C.sky, borderWidth: 3, borderColor: C.skySoft },
  destinationIcon: { width: 20, alignItems: 'center', marginHorizontal: 0 },
  connector: { height: 1, backgroundColor: C.lineSoft, marginLeft: 45 },
  stopCopy: { flex: 1, minWidth: 0 },
  stopLabel: { color: C.inkFaint, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.9 },
  stopValue: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 2 },
  statusRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statusPill: { flex: 1, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: R.pill, borderWidth: 1, borderColor: 'rgba(230,237,231,0.9)', paddingHorizontal: 12, paddingVertical: 8, ...SHADOW.card },
  statusText: { color: C.inkDim, fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  myLocationButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  floatingLeft: { position: 'absolute', left: 14, bottom: 278 },
  hazardButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: R.pill, backgroundColor: C.coral, paddingHorizontal: 15, paddingVertical: 10, ...SHADOW.floating },
  hazardText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  bottomArea: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  layerLegend: { alignSelf: 'flex-start', borderRadius: R.m, borderWidth: 1, borderColor: 'rgba(230,237,231,0.9)', backgroundColor: 'rgba(255,255,255,0.96)', paddingHorizontal: 10, paddingVertical: 8, gap: 5, ...SHADOW.card },
  legendHeading: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLabel: { color: C.inkDim, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.55 },
  legendScale: { flexDirection: 'row', gap: 9 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLine: { width: 14, height: 4, borderRadius: R.pill },
  legendText: { color: C.inkDim, fontSize: 9.5, fontWeight: '700' },
  profileRow: { gap: 8, paddingRight: 16 },
  profileChip: { minWidth: 152, minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: C.lineSoft, borderRadius: R.l, backgroundColor: 'rgba(255,255,255,0.97)', ...SHADOW.card },
  profileChipActive: { backgroundColor: C.mintDeep, borderColor: C.mintDeep },
  profileTitle: { color: C.ink, fontSize: 12, fontWeight: '800' },
  profileDetail: { color: C.inkDim, fontSize: 9.5, marginTop: 2, fontWeight: '600' },
  profileTextActive: { color: '#FFFFFF' },
  avoidToggle: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: 1, borderColor: C.lineSoft, paddingHorizontal: 11, paddingVertical: 7, borderRadius: R.pill, ...SHADOW.card },
  avoidToggleOn: { backgroundColor: C.coralSoft, borderColor: C.coralLine },
  avoidText: { color: C.inkDim, fontSize: 11.5, fontWeight: '700' },
  routeCard: { borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface, borderRadius: R.xl, padding: 15, ...SHADOW.floating },
  routeTopline: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  etaBlock: { flex: 1 },
  eta: { color: C.ink, fontSize: 29, lineHeight: 33, fontWeight: '800', letterSpacing: -0.8 },
  routeMeta: { color: C.inkDim, fontSize: 12, marginTop: 2, fontWeight: '600' },
  destinationText: { color: C.ink, fontSize: 13.5, fontWeight: '700', marginTop: 8 },
  warningText: { color: C.amber, fontSize: 11.5, marginTop: 6, lineHeight: 16, fontWeight: '600' },
  planTitle: { color: C.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.25 },
  planCopy: { color: C.inkDim, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  errorText: { color: C.coral, fontSize: 12, lineHeight: 17, marginTop: 9, fontWeight: '700' },
  routeButton: { marginTop: 13, borderRadius: R.m, minHeight: 50, backgroundColor: C.mintDeep, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  routeButtonText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
  startButton: { marginTop: 13, borderRadius: R.m, minHeight: 50, backgroundColor: C.mintDeep, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  startButtonText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
  buttonDisabled: { opacity: 0.6 },
})
