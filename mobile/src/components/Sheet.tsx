/**
 * Bottom sheet: animated slide-up container for reporting flows and details.
 * Gentle, non-blocking; scrim tap closes.
 */
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C, R } from '../theme'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const slide = useRef(new Animated.Value(0)).current
  const [mounted, setMounted] = React.useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      Animated.timing(slide, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    } else {
      Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        () => setMounted(false),
      )
    }
  }, [open, slide])

  if (!mounted) return null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Animated.View
        style={[
          styles.scrim,
          { opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
        ]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexEnd}>
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [
                {
                  translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }),
                },
              ],
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim },
  flexEnd: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 26,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: C.line,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: C.ink, fontSize: 18, fontWeight: '800' },
  close: { color: C.inkFaint, fontSize: 17, padding: 4 },
})

export function SafeArea({ children, style }: { children: React.ReactNode; style?: object }) {
  return <SafeAreaView style={style}>{children}</SafeAreaView>
}
