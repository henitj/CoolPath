/**
 * CoolPath design system — calm, deep-teal wellness palette.
 * Cool mint = good conditions · warm amber = caution · soft coral = rough.
 */
export const C = {
  // base surfaces
  bg: '#0B3B36', // deep pine (app background)
  bgDeep: '#072B27', // darker wells
  surface: '#10443E', // cards
  surfaceHi: '#155249', // pressed / highlighted cards
  line: '#1E5F55', // hairlines
  lineSoft: '#174F47',

  // text
  ink: '#EAF6F2', // primary
  inkDim: '#A8CFC6', // secondary
  inkFaint: '#6E9C93', // tertiary

  // accents
  mint: '#5EEAD4', // primary accent (cool/good)
  mintDeep: '#2DD4BF',
  sun: '#FCD34D', // warm accents
  amber: '#FBBF24',
  coral: '#FB8A80', // alerts (soft, not alarming)
  sky: '#8DD3FF', // info / water

  // profile colors
  cool: '#5EEAD4',
  safe: '#A7F3A0',
  fast: '#CFE9E2',

  // overlay
  scrim: 'rgba(4, 26, 23, 0.72)',
} as const

export const SPACING = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const

export const R = { s: 10, m: 16, l: 22, xl: 28, pill: 999 } as const

export const TYPO = {
  hero: { fontSize: 44, fontWeight: '800' as const, color: C.ink, letterSpacing: -1 },
  h1: { fontSize: 26, fontWeight: '800' as const, color: C.ink, letterSpacing: -0.4 },
  h2: { fontSize: 19, fontWeight: '700' as const, color: C.ink },
  h3: { fontSize: 15, fontWeight: '700' as const, color: C.ink },
  body: { fontSize: 14.5, fontWeight: '500' as const, color: C.inkDim, lineHeight: 21 },
  small: { fontSize: 12.5, fontWeight: '500' as const, color: C.inkFaint },
  tiny: { fontSize: 10.5, fontWeight: '600' as const, color: C.inkFaint, letterSpacing: 1.2 },
} as const

export const SHADOW = {
  card: {
    shadowColor: '#03201C',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
} as const
