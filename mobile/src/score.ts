/**
 * Calm interpretation layer: turns raw numbers into friendly verdicts,
 * colours and coaching tips so the UI never shows a bare statistic
 * without telling the user what it means for their walk.
 */
export type Tone = 'good' | 'mild' | 'warm' | 'hot'

export interface Verdict {
  tone: Tone
  color: string
  label: string
  message: string
}

const VERDICTS: Record<Tone, Omit<Verdict, 'tone' | 'message'>> = {
  good: { color: '#5EEAD4', label: 'Great' },
  mild: { color: '#A7F3A0', label: 'Pleasant' },
  warm: { color: '#FCD34D', label: 'Warm' },
  hot: { color: '#FB8A80', label: 'Hot out' },
}

export function verdictForComfort(comfort: number): Verdict {
  const tone: Tone =
    comfort >= 65 ? 'good' : comfort >= 45 ? 'mild' : comfort >= 28 ? 'warm' : 'hot'
  const base = VERDICTS[tone]
  const messages: Record<Tone, string> = {
    good: 'Great walking weather — enjoy it.',
    mild: 'Pretty comfortable. Shade helps on longer walks.',
    warm: 'Warm out there — the shaded route is worth it.',
    hot: 'It’s hot. Take the coolest path, bring water.',
  }
  return { tone, ...base, message: messages[tone] }
}

export function tempBand(tempC: number): { label: string; color: string } {
  if (tempC < 31) return { label: 'Cool pavement', color: '#8DD3FF' }
  if (tempC < 36) return { label: 'Mild surface', color: '#5EEAD4' }
  if (tempC < 41) return { label: 'Warm surface', color: '#FCD34D' }
  return { label: 'Hot surface', color: '#FB8A80' }
}

export function shadeLabel(shadePct: number): string {
  if (shadePct >= 55) return 'Well shaded'
  if (shadePct >= 30) return 'Partly shaded'
  if (shadePct >= 12) return 'Light shade'
  return 'Mostly exposed'
}

/** Sun-position aware tip, e.g. "low sun — long shadows from the west". */
export function sunTip(altitudeDeg: number, isDaytime: boolean): string {
  if (!isDaytime) return 'Night — streetlights matter more than shade'
  if (altitudeDeg < 25) return 'Low sun — buildings cast long, walkable shadows'
  if (altitudeDeg > 70) return 'High sun — shade is scarce, plan around canopy'
  return 'Mid sun — edges of buildings still give good shade'
}

export function profileCopy(profile: 'cool' | 'safe' | 'fastest'): { title: string; blurb: string } {
  switch (profile) {
    case 'cool':
      return { title: 'Coolest', blurb: 'Tree canopy, building shade, cool surfaces' }
    case 'safe':
      return { title: 'Easiest', blurb: 'Sidewalks, lighting, fewer reported hazards' }
    default:
      return { title: 'Shortest', blurb: 'Plain shortest walk, no climate weighting' }
  }
}

/** One calm coaching line based on the conditions at a point. */
export function coachingTip(input: {
  comfort: number
  shadePct: number
  tempC: number
  isDaytime: boolean
}): string {
  if (!input.isDaytime) return 'Evenings are calm — stick to lit streets.'
  if (input.tempC >= 40 && input.shadePct < 25)
    return 'Hot and exposed here — a canopy route nearby could feel 5–8° cooler.'
  if (input.tempC >= 38 && input.shadePct < 40)
    return 'Warm with little cover — the shaded option is worth a couple of minutes.'
  if (input.shadePct >= 60) return 'Nice and shaded here — comfortable walking.'
  if (input.comfort >= 65) return 'Conditions are on your side — good time for a stroll.'
  return 'Conditions are fine — longer walks will feel the heat.'
}
