import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C, R } from '../theme'

export function LoadingDots({ label }: { label?: string }) {
  const phase = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(phase, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
    )
    anim.start()
    return () => anim.stop()
  }, [phase])

  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map((i) => {
        const opacity = phase.interpolate({
          inputRange: [0, 0.33, 0.66, 1],
          outputRange: [0.25, 1, 0.25, 0.25],
          extrapolate: 'clamp',
        })
        const t = Animated.multiply(phase, 1)
        void t
        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity,
                transform: [
                  {
                    translateY: phase.interpolate({
                      inputRange: [i * 0.18, 0.5 + i * 0.1, 1],
                      outputRange: [0, -3, 0],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          />
        )
      })}
      {label ? <Text style={styles.dotsLabel}>{label}</Text> : null}
    </View>
  )
}

export function ErrorNotice({
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} hitSlop={8}>
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.mint },
  dotsLabel: { color: C.inkFaint, fontSize: 12.5, marginLeft: 6 },
  errorBox: {
    backgroundColor: 'rgba(251,138,128,0.08)',
    borderColor: 'rgba(251,138,128,0.35)',
    borderWidth: 1,
    borderRadius: R.m,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: { color: '#F5B8B0', fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 19 },
  retryBtn: {
    backgroundColor: 'rgba(251,138,128,0.16)',
    borderRadius: R.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  retryText: { color: '#F5B8B0', fontSize: 12.5, fontWeight: '800' },
})
