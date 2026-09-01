import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native'
import { C, R, SHADOW } from '../theme'

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode
  style?: ViewStyle | ViewStyle[]
  onPress?: () => void
}) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.card, style]}>
        {children}
      </TouchableOpacity>
    )
  }
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionText}>{children}</Text>
      {right}
    </View>
  )
}

export function Chip({
  label,
  color = C.inkDim,
  filled = false,
}: {
  label: string
  color?: string
  filled?: boolean
}) {
  return (
    <View
      style={[
        styles.chip,
        filled ? { backgroundColor: color, borderColor: color } : { borderColor: C.line },
      ]}
    >
      <Text style={[styles.chipText, filled ? { color: '#FFFFFF' } : { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: R.l,
    borderWidth: 1,
    borderColor: C.lineSoft,
    padding: 16,
    ...SHADOW.card,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionText: {
    color: C.inkFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: R.pill,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 11.5, fontWeight: '700' },
})
