import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { C, R } from '../theme'

interface Option<T extends string> {
  value: T
  label: string
  sub?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.opt, active && styles.optActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.optText, active && styles.optTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
            {o.sub ? (
              <Text style={[styles.optSub, active && styles.optSubActive]} numberOfLines={1}>
                {o.sub}
              </Text>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: C.bgDeep,
    borderRadius: R.m,
    borderWidth: 1,
    borderColor: C.lineSoft,
    padding: 3,
    gap: 3,
  },
  opt: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: R.s + 2,
  },
  optActive: { backgroundColor: C.surfaceHi },
  optText: { color: C.inkFaint, fontSize: 13, fontWeight: '700' },
  optTextActive: { color: C.mint },
  optSub: { color: C.inkFaint, fontSize: 9.5, marginTop: 1 },
  optSubActive: { color: C.inkDim },
})
