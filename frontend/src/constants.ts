import type { ProfileId } from './types'

export interface ProfileCardMeta {
  id: ProfileId
  label: string
  blurb: string
  icon: string
  accent: string
  ring: string
}

export const PROFILE_CARDS: ProfileCardMeta[] = [
  {
    id: 'fastest',
    label: 'Fastest',
    blurb: 'Shortest A* path, minimal micro-climate weighting',
    icon: '⚡',
    accent: 'text-slate-300',
    ring: 'ring-slate-400/70',
  },
  {
    id: 'cool',
    label: 'Cool & Shaded',
    blurb: 'Canopy, building shadows and low surface temperature',
    icon: '🌳',
    accent: 'text-cyan-300',
    ring: 'ring-cyan-400/70',
  },
  {
    id: 'safe',
    label: 'Safe & Accessible',
    blurb: 'Penalises hazards, missing sidewalks, unlit segments',
    icon: '🛡️',
    accent: 'text-emerald-300',
    ring: 'ring-emerald-400/70',
  },
]

export const HAZARD_ICONS: Record<string, string> = {
  broken_sidewalk: '🚧',
  extreme_sun: '☀️',
  unlit_area: '🌑',
  construction: '👷',
  blocked_path: '⛔',
  flooding: '🌊',
  other: '📍',
}
