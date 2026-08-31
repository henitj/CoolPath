import type { RouteMetrics, Units } from './types'

export function formatTemp(c: number, units: Units): string {
  if (units === 'F') return `${Math.round(c * 1.8 + 32)}°`
  return `${Math.round(c)}°`
}

export function formatTempUnit(c: number, units: Units): string {
  if (units === 'F') return `${Math.round(c * 1.8 + 32)}°F`
  return `${Math.round(c)}°C`
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min))
  if (total < 60) return `${total} min`
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatAgo(hours: number): string {
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.round(hours)} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/** Relative comfort delta phrased calmly, e.g. "3° cooler · +12 shade" */
export function deltaSummary(tempDeltaC: number, shadeDeltaPct: number): string | null {
  const bits: string[] = []
  if (Math.abs(tempDeltaC) >= 0.3) {
    bits.push(`${Math.abs(tempDeltaC).toFixed(1)}° ${tempDeltaC < 0 ? 'cooler' : 'warmer'}`)
  }
  if (Math.abs(shadeDeltaPct) >= 1) {
    bits.push(`${Math.abs(shadeDeltaPct).toFixed(0)}% ${shadeDeltaPct >= 0 ? 'more' : 'less'} shade`)
  }
  return bits.length ? bits.join(' · ') : null
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function routeDistanceM(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
  }
  return total
}

/** Simple walking estimate used before the server answers (calm UX). */
export function quickWalkMinutes(m: RouteMetrics): number {
  return m.distance_m / 1.34 / 60
}
