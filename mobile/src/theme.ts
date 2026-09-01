import { Platform } from 'react-native'

/**
 * Calm, daylight-first design tokens for the map-centric walking experience.
 *
 * The neutral background keeps a real map visually primary, while a measured
 * evergreen accent anchors interactive controls. Condition colours intentionally
 * remain distinct: green is comfortable, amber needs care, and red is poor.
 */
export const C = {
  bg: '#F6F8F4',
  bgDeep: '#0D4D30',
  bgRaised: '#EEF4EE',
  surface: '#FFFFFF',
  surfaceHi: '#FBFDFC',
  surfaceMuted: '#F1F6F1',
  ink: '#15251A',
  inkDim: '#526258',
  inkFaint: '#77857B',
  line: '#D5E1D7',
  lineSoft: '#E6EDE7',
  mint: '#237F4D',
  mintDeep: '#146B43',
  mintDark: '#0D4D30',
  mintSoft: '#DFF2E5',
  mintSofter: '#EFF8F1',
  cool: '#087E76',
  safe: '#5A8126',
  fast: '#3277C8',
  sky: '#2F7FE7',
  skySoft: '#EAF2FF',
  amber: '#915805',
  sun: '#A86309',
  amberSoft: '#FFF5E4',
  amberLine: '#F1D5A1',
  coral: '#B93E38',
  coralSoft: '#FFF0EF',
  coralLine: '#F0C4C0',
  scrim: 'rgba(21, 37, 26, 0.28)',
} as const

export const R = {
  s: 12,
  m: 16,
  l: 22,
  xl: 28,
  pill: 999,
} as const

export const SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: '#183225',
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 7 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  floating: Platform.select({
    ios: {
      shadowColor: '#183225',
      shadowOpacity: 0.13,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 6 },
    default: {},
  }),
} as const

export const TYPO = {
  hero: { color: C.ink, fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.8 },
  h1: { color: C.ink, fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.45 },
  body: { color: C.inkDim, fontSize: 14, lineHeight: 21 },
  eyebrow: { color: C.inkFaint, fontSize: 10.5, fontWeight: '800' as const, letterSpacing: 0.9 },
} as const
