import React from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng, type Region } from 'react-native-maps'
import { C } from '../theme'
import type { HazardFeature, RoadConditionFeature, RouteFeature } from '../types'

export interface MapCoordinate {
  latitude: number
  longitude: number
}

export interface MapLongPressEvent {
  nativeEvent: { coordinate: MapCoordinate }
}

export interface MapRegion extends Region {}

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

export const GREEN_DAY_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F7FBF7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#456458' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7FBF7' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#D8E8DD' }] },
  { featureType: 'landscape.natural', elementType: 'geometry.fill', stylers: [{ color: '#EAF5E9' }] },
  { featureType: 'poi', elementType: 'geometry.fill', stylers: [{ color: '#E8F4E8' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#CDE8CB' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D9E8DE' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#C6DCCF' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#CDE9E7' }] },
]

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

/** A native MapKit/Google Maps canvas included in Expo Go via react-native-maps. */
export default function WalkingMap({
  onMapReady,
  route,
  baseline,
  roadConditions = [],
  hazards = [],
  origin,
  destination,
  onLongPress,
  initialRegion = DOWNTOWN_REGION,
  followLocation = false,
  children,
}: WalkingMapProps) {
  return (
    <MapView
      ref={(instance) => {
        if (instance) onMapReady?.(instance as unknown as MapController)
      }}
      style={StyleSheet.absoluteFillObject}
      initialRegion={initialRegion}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      customMapStyle={Platform.OS === 'android' ? GREEN_DAY_MAP_STYLE : undefined}
      mapType="standard"
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass
      rotateEnabled={followLocation}
      pitchEnabled={followLocation}
      onLongPress={onLongPress as ((event: Parameters<NonNullable<React.ComponentProps<typeof MapView>['onLongPress']>>[0]) => void) | undefined}
      accessibilityLabel="Interactive walking map of Downtown Austin"
    >
      {roadConditions.map((feature, index) => (
        <Polyline
          key={`${feature.properties.name}-${index}`}
          coordinates={feature.geometry.coordinates.map(asLatLng)}
          strokeColor={feature.properties.color}
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
          zIndex={1}
        />
      ))}

      {hazards.map((hazard) => (
        <Marker
          key={`hazard-${hazard.properties.id}`}
          coordinate={asLatLng(hazard.geometry.coordinates)}
          title={hazard.properties.label}
          description={`Reported condition · severity ${hazard.properties.severity}`}
          pinColor={C.coral}
          tracksViewChanges={false}
          zIndex={3}
        />
      ))}

      {baseline?.geometry.coordinates && baseline.geometry.coordinates.length > 1 && (
        <Polyline
          coordinates={baseline.geometry.coordinates.map(asLatLng)}
          strokeColor="#6F8E9A"
          strokeWidth={4}
          lineDashPattern={[8, 8]}
          lineCap="round"
          lineJoin="round"
          zIndex={4}
        />
      )}

      {route?.geometry.coordinates && route.geometry.coordinates.length > 1 && (
        <Polyline
          coordinates={route.geometry.coordinates.map(asLatLng)}
          strokeColor="#0D6E43"
          strokeWidth={7}
          lineCap="round"
          lineJoin="round"
          zIndex={5}
        />
      )}

      {origin && (
        <Marker
          coordinate={{ latitude: origin.lat, longitude: origin.lon }}
          title={origin.name}
          pinColor={C.mintDeep}
          tracksViewChanges={false}
          zIndex={6}
        />
      )}
      {destination && (
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lon }}
          title={destination.name}
          pinColor={C.coral}
          tracksViewChanges={false}
          zIndex={6}
        />
      )}
      {children}
    </MapView>
  )
}

export function MapAttributionShade() {
  // A transparent wrapper gives floating controls a small touch-safe home if
  // the platform needs it; all visible map attribution remains native.
  return <View pointerEvents="none" style={styles.attributionShade} />
}

const styles = StyleSheet.create({
  attributionShade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 1,
    height: 1,
  },
})
