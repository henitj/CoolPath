import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { api } from '../api'
import { filterPlaces } from '../places'
import { C, R, SHADOW } from '../theme'
import type { Place } from '../types'

interface PlacePickerProps {
  visible: boolean
  kind: 'origin' | 'destination'
  places: Place[]
  onClose: () => void
  onSelect: (place: Place) => void
  onUseLocation?: () => void
}

/** Searchable, phone-friendly stop picker backed by offline and API search. */
export default function PlacePicker({ visible, kind, places, onClose, onSelect, onUseLocation }: PlacePickerProps) {
  const [query, setQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState<Place[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!visible) {
      setQuery('')
      setRemoteResults(null)
      return
    }
    const cleaned = query.trim()
    if (cleaned.length < 2) {
      setRemoteResults(null)
      setSearching(false)
      return
    }
    let current = true
    setSearching(true)
    const timeout = setTimeout(() => {
      void api
        .searchPlaces(cleaned)
        .then((response) => {
          if (current) setRemoteResults(response.places)
        })
        .catch(() => {
          // The local list remains useful when a dev phone cannot reach the API.
          if (current) setRemoteResults(null)
        })
        .finally(() => {
          if (current) setSearching(false)
        })
    }, 260)
    return () => {
      current = false
      clearTimeout(timeout)
    }
  }, [query, visible])

  const results = useMemo(() => {
    const local = filterPlaces(places, query).slice(0, 10)
    if (!remoteResults?.length) return local
    const known = new Set(remoteResults.map((place) => place.id))
    return [...remoteResults, ...local.filter((place) => !known.has(place.id))].slice(0, 12)
  }, [places, query, remoteResults])

  const choose = (place: Place) => {
    onSelect(place)
    onClose()
  }

  const title = kind === 'origin' ? 'Choose your start' : 'Choose a destination'
  const placeholder = kind === 'origin' ? 'Search a downtown start' : 'Search streets, parks, or landmarks'

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheetHandle} />
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close place search" onPress={onClose} hitSlop={12} style={styles.iconButton}>
              <MaterialIcons name="close" size={24} color={C.ink} />
            </Pressable>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subTitle}>Downtown Austin walking coverage</Text>
            </View>
          </View>

          <View style={styles.searchField}>
            <MaterialIcons name="search" size={22} color={C.inkDim} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={C.inkFaint}
              style={styles.input}
              returnKeyType="search"
              accessibilityLabel={placeholder}
            />
            {searching && <ActivityIndicator size="small" color={C.mint} />}
          </View>

          {kind === 'origin' && onUseLocation && (
            <Pressable style={styles.liveRow} onPress={onUseLocation} accessibilityRole="button">
              <View style={styles.liveIcon}><MaterialIcons name="my-location" size={20} color={C.mintDeep} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Use current phone location</Text>
                <Text style={styles.rowDetail}>Calibrates GPS before creating the route</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={C.inkFaint} />
            </Pressable>
          )}

          <Text style={styles.hint}>
            {query.trim() ? 'Search results' : 'Popular downtown destinations'}
          </Text>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable style={styles.result} onPress={() => choose(item)} accessibilityRole="button">
                <View style={styles.placeIcon}>
                  <MaterialIcons name={item.kind === 'park' || item.kind === 'trail' ? 'park' : 'place'} size={20} color={C.mintDeep} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.rowDetail} numberOfLines={1}>{item.kind} · {item.blurb}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={C.inkFaint} />
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="search-off" size={28} color={C.inkFaint} />
                <Text style={styles.emptyTitle}>No downtown match yet</Text>
                <Text style={styles.emptyCopy}>Try a street, landmark, intersection, or pasted coordinates.</Text>
              </View>
            }
          />
          <Text style={styles.mapTip}>Tip: close this panel and long-press the map to drop a precise pin.</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: { flex: 1, paddingHorizontal: 16 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: R.pill, backgroundColor: C.line, marginTop: 8, marginBottom: 5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 17 },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  titleWrap: { flex: 1 },
  title: { color: C.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.35 },
  subTitle: { color: C.inkFaint, fontSize: 12, marginTop: 3, fontWeight: '600' },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line, borderRadius: R.l, backgroundColor: C.surface, paddingHorizontal: 14, minHeight: 56, ...SHADOW.card },
  input: { flex: 1, color: C.ink, fontSize: 16, paddingVertical: 13 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.mintSofter, borderRadius: R.l, marginTop: 13, padding: 13, borderWidth: 1, borderColor: '#C9E4D0' },
  liveIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: '800' },
  rowDetail: { color: C.inkDim, fontSize: 12, marginTop: 3, textTransform: 'capitalize', lineHeight: 16 },
  hint: { color: C.inkFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.95, textTransform: 'uppercase', marginTop: 23, marginBottom: 8, marginHorizontal: 4 },
  list: { gap: 8, paddingBottom: 16 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.lineSoft, padding: 13 },
  placeIcon: { width: 39, height: 39, borderRadius: 20, backgroundColor: C.mintSoft, alignItems: 'center', justifyContent: 'center' },
  empty: { marginTop: 14, paddingTop: 30, paddingBottom: 30, alignItems: 'center', gap: 8, paddingHorizontal: 34, backgroundColor: C.surfaceHi, borderRadius: R.l },
  emptyTitle: { color: C.ink, fontSize: 15, fontWeight: '800' },
  emptyCopy: { color: C.inkDim, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mapTip: { color: C.inkDim, fontSize: 11.5, lineHeight: 17, textAlign: 'center', paddingVertical: 11, paddingHorizontal: 16 },
})
