import React, { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { C } from '../theme'
import type { HazardFeature, RoadConditionFeature, RouteFeature } from '../types'

export interface MapCoordinate {
  latitude: number
  longitude: number
}

export interface MapLongPressEvent {
  nativeEvent: { coordinate: MapCoordinate }
}

export interface MapRegion {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

export interface MapController {
  animateToRegion: (region: MapRegion, duration?: number) => void
  fitToCoordinates: (coordinates: MapCoordinate[], options: { edgePadding: { top: number; right: number; bottom: number; left: number }; animated?: boolean }) => void
  animateCamera: (camera: { center: MapCoordinate; heading?: number; pitch?: number; zoom?: number }, options?: { duration?: number }) => void
}

export const DOWNTOWN_REGION: MapRegion = {
  latitude: 30.2672,
  longitude: -97.7431,
  latitudeDelta: 0.022,
  longitudeDelta: 0.022,
}

export interface MapStop {
  id: string
  name: string
  lat: number
  lon: number
}

export function asLatLng(lonLat: [number, number]): MapCoordinate {
  return { latitude: lonLat[1], longitude: lonLat[0] }
}

interface WalkingMapProps {
  onMapReady?: (controller: MapController) => void
  route?: RouteFeature | null
  baseline?: RouteFeature | null
  roadConditions?: RoadConditionFeature[]
  hazards?: HazardFeature[]
  origin?: MapStop | null
  destination?: MapStop | null
  onLongPress?: (event: MapLongPressEvent) => void
  initialRegion?: MapRegion
  followLocation?: boolean
  children?: React.ReactNode
}

/**
 * Browser-development fallback. Expo Go resolves the .native implementation,
 * which is a real MapKit/Google map. Keeping this lightweight fallback lets
 * `npm run mobile:web` remain useful without importing a native map module.
 */
export default function WalkingMap({
  onMapReady,
  route,
  roadConditions = [],
  origin,
  destination,
  onLongPress,
  initialRegion = DOWNTOWN_REGION,
  children,
}: WalkingMapProps) {
  const controller = useMemo<MapController>(() => ({
    animateToRegion: () => {},
    fitToCoordinates: () => {},
    animateCamera: () => {},
  }), [])
  useEffect(() => onMapReady?.(controller), [controller, onMapReady])

  return (
    <Pressable
      style={styles.canvas}
      onLongPress={() => onLongPress?.({ nativeEvent: { coordinate: { latitude: initialRegion.latitude, longitude: initialRegion.longitude } } })}
      accessibilityLabel="Map preview. Open the project in Expo Go for native interactive maps."
    >
      <View pointerEvents="none" style={styles.greenLand} />
      {Array.from({ length: 9 }).map((_, index) => <View key={`road-${index}`} pointerEvents="none" style={[styles.road, { top: `${9 + index * 10}%`, transform: [{ rotate: index % 2 ? '-15deg' : '8deg' }] }]} />)}
      {roadConditions.slice(0, 18).map((feature, index) => <View key={`condition-${index}`} pointerEvents="none" style={[styles.conditionRoad, { backgroundColor: feature.properties.color, top: `${11 + (index % 8) * 10}%`, left: `${(index * 17) % 40}%`, transform: [{ rotate: index % 2 ? '-12deg' : '7deg' }] }]} />)}
      {route && <View pointerEvents="none" style={styles.routeLine} />}
      {origin && <MapPin side="left" color={C.mintDeep} label={origin.name} />}
      {destination && <MapPin side="right" color={C.coral} label={destination.name} />}
      <View pointerEvents="none" style={styles.notice}>
        <MaterialIcons name="map" size={17} color={C.inkDim} />
        <Text style={styles.noticeText}>Open in Expo Go for the native interactive map</Text>
      </View>
      {children}
    </Pressable>
  )
}

function MapPin({ side, color, label }: { side: 'left' | 'right'; color: string; label: string }) {
  return (
    <View pointerEvents="none" style={[styles.pin, side === 'left' ? styles.pinLeft : styles.pinRight]}>
      <MaterialIcons name="place" size={24} color={color} />
      <Text style={styles.pinText} numberOfLines={1}>{label}</Text>
    </View>
  )
}

export function MapAttributionShade() {
  return null
}

const styles = StyleSheet.create({
  canvas: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: '#EAF5E9' },
  greenLand: { ...StyleSheet.absoluteFillObject, backgroundColor: '#EAF5E9' },
  road: { position: 'absolute', width: '135%', height: 13, left: '-18%', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#D8E9DC' },
  conditionRoad: { position: 'absolute', width: '73%', height: 4, borderRadius: 4, opacity: 0.85 },
  routeLine: { position: 'absolute', width: '120%', height: 8, borderRadius: 5, backgroundColor: C.mintDeep, top: '53%', left: '-10%', transform: [{ rotate: '-21deg' }] },
  notice: { position: 'absolute', top: 138, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.94)' },
  noticeText: { color: C.inkDim, fontSize: 11, fontWeight: '700' },
  pin: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 135, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.92)' },
  pinLeft: { top: '38%', left: '14%' },
  pinRight: { top: '58%', right: '12%' },
  pinText: { color: C.ink, fontSize: 10, fontWeight: '700', maxWidth: 90 },
})
