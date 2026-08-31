import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { C, R } from './theme'

type ToastKind = 'info' | 'good' | 'warn'
interface Toast {
  id: number
  msg: string
  kind: ToastKind
}

const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

const COLORS: Record<ToastKind, string> = {
  info: C.sky,
  good: '#A7F3A0',
  warn: C.amber,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const anim = useRef(new Animated.Value(0)).current
  const counter = useRef(0)

  const show = useCallback(
    (msg: string, kind: ToastKind = 'info') => {
      counter.current += 1
      setToast({ id: counter.current, msg, kind })
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 260, delay: 2400, useNativeDriver: true }),
      ]).start(() => setToast(null))
    },
    [anim],
  )

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity: anim,
              transform: [
                {
                  translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: COLORS[toast.kind] }]} />
          <Text style={styles.text}>{toast.msg}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  )
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    maxWidth: '86%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.bgDeep,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { color: C.ink, fontSize: 13, fontWeight: '600', flexShrink: 1 },
})
