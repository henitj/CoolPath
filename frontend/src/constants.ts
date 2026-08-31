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

// Kept in sync with the backend hazard taxonomy, so the drawer works even
// before the API has been reached.
export const HAZARD_CATEGORIES = [
  { id: 'broken_sidewalk', label: 'Broken Sidewalk', color: '#f97316', weight: 0.6 },
  { id: 'extreme_sun', label: 'No Shade / Extreme Sun', color: '#facc15', weight: 0.5 },
  { id: 'unlit_area', label: 'Unlit Area', color: '#a78bfa', weight: 0.55 },
  { id: 'construction', label: 'Construction', color: '#60a5fa', weight: 0.7 },
  { id: 'blocked_path', label: 'Blocked Path', color: '#f472b6', weight: 0.8 },
  { id: 'flooding', label: 'Flooding / Standing Water', color: '#22d3ee', weight: 0.85 },
  { id: 'other', label: 'Other', color: '#94a3b8', weight: 0.4 },
]
