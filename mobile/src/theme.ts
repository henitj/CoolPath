import { Platform } from 'react-native'

/**
 * A high-contrast daylight palette for a map-first walking experience.
 * Road-condition colors intentionally stay recognizable at a glance:
 * green = comfortable, amber = use care, red = poor conditions.
 */
export const C = {
  bg: '#EEF8F0',
  bgDeep: '#103D2C',
  surface: '#FFFFFF',
  surfaceHi: '#F8FCF8',
  ink: '#17352A',
  inkDim: '#456458',
  inkFaint: '#6E887C',
  line: '#BFD8C7',
  lineSoft: '#DDECE1',
  mint: '#16834B',
  mintDeep: '#0D6538',
  cool: '#047C74',
  safe: '#4B7F20',
  fast: '#3974B8',
  amber: '#C67A05',
  sun: '#B86500',
  coral: '#C8443D',
  sky: '#2878B9',
  scrim: 'rgba(18, 56, 38, 0.30)',
} as const

export const R = {
  s: 10,
  m: 14,
  l: 20,
  xl: 28,
  pill: 999,
} as const

export const SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: '#17352A',
      shadowOpacity: 0.10,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
    },
    android: { elevation: 3 },
    default: {},
  }),
} as const

export const TYPO = {
  hero: { color: C.ink, fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.7 },
  h1: { color: C.ink, fontSize: 23, fontWeight: '800' as const, letterSpacing: -0.35 },
  body: { color: C.inkDim, fontSize: 14, lineHeight: 21 },
} as const
