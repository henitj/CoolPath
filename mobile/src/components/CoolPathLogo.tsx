/**
 * The CoolPath mark: a leaf-path-pin glyph that adapts to context.
 *
 * Variants (all from one component):
 *  - static header mark, spinning while any network call is in flight
 *  - size/colour themable
 *  - `pulse` aura for "live conditions" (Near me)
 *  - `success` state (check mark) after submitting a report
 *  - `error` state (gentle cross) when something needs attention
 *  - rendered as the splash/hero emblem at large sizes
 */
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native'
import Svg, { Circle, G, Path, CircleProps, PathProps } from 'react-native-svg'

const LEAF_PATH =
  'M32 6 C20 6 12 14 12 26 C12 34 17 40 24 42 C24 34 27 24 36 18 ' +
  'C29 26 26 34 26 43 C36 44 46 38 47 27 C48 16 41 7 32 6 Z'

const TRAIL_PATH =
  'M30 46 C26 52 34 55 30 61 C26 67 34 70 31 76'

export type LogoMood = 'calm' | 'busy' | 'success' | 'error'

interface CoolPathLogoProps {
  size?: number
  color?: string
  trailColor?: string
  mood?: LogoMood
  pulse?: boolean
  style?: ViewStyle
}

export default function CoolPathLogo({
  size = 40,
  color = '#5EEAD4',
  trailColor = '#A8CFC6',
  mood = 'calm',
  pulse = false,
  style,
}: CoolPathLogoProps) {
  const spin = useRef(new Animated.Value(0)).current
  const breathe = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let spinAnim: Animated.CompositeAnimation | null = null
    let breathAnim: Animated.CompositeAnimation | null = null
    if (mood === 'busy') {
      spinAnim = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }),
      )
      spinAnim.start()
    }
    if (pulse || mood === 'busy') {
      breathAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      )
      breathAnim.start()
    }
    return () => {
      spinAnim?.stop()
      breathAnim?.stop()
    }
  }, [mood, pulse, spin, breathe])

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
  const auraOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.35] })
  const auraScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] })

  const stroke = mood === 'error' ? '#FB8A80' : mood === 'success' ? '#A7F3A0' : color
  const animated = mood === 'busy' || mood === 'success' || mood === 'error'

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {pulse && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: size, backgroundColor: stroke, opacity: auraOpacity, transform: [{ scale: auraScale }] },
          ]}
        />
      )}
      <Animated.View style={{ transform: [{ rotate: mood === 'busy' ? spinDeg : '0deg' }, { scale: animated ? scale : 1 }] }}>
        <LogoGlyph size={size} stroke={stroke} trailColor={trailColor} mood={mood} />
      </Animated.View>
    </View>
  )
}

export function LogoGlyph({
  size,
  stroke,
  trailColor,
  mood,
}: {
  size: number
  stroke: string
  trailColor: string
  mood: LogoMood
}) {
  const s = size / 52
  const commonPath: PathProps = {
    stroke: stroke,
    strokeWidth: 3.4 * s,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 52 52">
      {mood === 'success' ? (
        <G>
          <Path d="M12 28 L22 38 L41 17" {...commonPath} strokeWidth={4.2 * s} />
        </G>
      ) : mood === 'error' ? (
        <G>
          <Path d="M16 16 L36 36" {...commonPath} strokeWidth={4.2 * s} />
          <Path d="M36 16 L16 36" {...commonPath} strokeWidth={4.2 * s} />
        </G>
      ) : (
        <G>
          <Path d={LEAF_PATH} {...commonPath} />
          <Path d={TRAIL_PATH} stroke={trailColor} strokeWidth={3 * s} strokeLinecap="round" fill="none" />
          <Circle cx={31} cy={43.5} r={3.1 * s} fill={trailColor} />
          {/* sun rays */}
          <Path d="M42 8 L44.5 5.5" stroke={trailColor} strokeWidth={2.2 * s} strokeLinecap="round" />
          <Path d="M45.5 13 L49 12" stroke={trailColor} strokeWidth={2.2 * s} strokeLinecap="round" />
        </G>
      )}
    </Svg>
  )
}

/** Tiny circular halo used behind tab icons. */
export function LogoHalo({ children, active }: { children: React.ReactNode; active: boolean }) {
  const glow = useRef(new Animated.Value(active ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(glow, { toValue: active ? 1 : 0, duration: 260, useNativeDriver: true }).start()
  }, [active, glow])
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: '#5EEAD4',
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
        }}
      />
      {children}
    </View>
  )
}

export function PressDot({ color = '#5EEAD4' }: { color?: string }) {
  return <CirclePropsHelp color={color} />
}

// helper to keep Svg Circle props tidy
function CirclePropsHelp({ color }: { color: string }) {
  return (
    <Svg width={6} height={6}>
      <Circle cx={3} cy={3} r={3} fill={color} />
    </Svg>
  )
}
