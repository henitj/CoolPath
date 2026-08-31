import { describe, expect, it } from 'vitest'
import {
  comparisonRows,
  formatDelta,
  formatDistance,
  formatMinutes,
  formatTemp,
  tempColor,
} from './format'
import type { Metrics } from '../types'

const base: Metrics = {
  distance_m: 1200,
  est_walk_min: 15,
  effort_min: 18,
  avg_temp_c: 38,
  max_temp_c: 43,
  avg_ndvi: 0.2,
  canopy_pct: 30,
  shadow_pct: 10,
  shade_pct: 38,
  hazard_count: 1,
  comfort_score: 40,
}

describe('formatDistance', () => {
  it('formats metres and kilometres', () => {
    expect(formatDistance(850)).toBe('850 m')
    expect(formatDistance(1234)).toBe('1.23 km')
  })
})

describe('formatTemp', () => {
  it('converts between C and F', () => {
    expect(formatTemp(38, 'C')).toBe('38.0°C')
    expect(formatTemp(38, 'F')).toBe('100°F')
    expect(formatTemp(0, 'F')).toBe('32°F')
  })
})

describe('formatMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(75)).toBe('1 h 15 min')
  })
})

describe('formatDelta', () => {
  it('signs deltas', () => {
    expect(formatDelta(12.34, 0)).toBe('+12')
    expect(formatDelta(-3.2, 1)).toBe('-3.2')
  })
})

describe('comparisonRows', () => {
  it('marks cooler/shadier choice as better', () => {
    const cooler: Metrics = { ...base, avg_temp_c: 36.5, shade_pct: 55, distance_m: 1400, comfort_score: 62 }
    const rows = comparisonRows(cooler, base, 'C')
    const tempRow = rows.find((r) => r.label === 'Avg. surface temp')!
    expect(tempRow.better).toBe(true)
    expect(tempRow.chosen).toBe('36.5°C')
    const distRow = rows.find((r) => r.label === 'Distance')!
    expect(distRow.better).toBe(false) // longer distance is worse
    const shadeRow = rows.find((r) => r.label === 'Shaded (canopy+shadow)')!
    expect(shadeRow.chosen).toBe('55%')
  })

  it('handles F conversion in rows', () => {
    const rows = comparisonRows(base, base, 'F')
    const tempRow = rows.find((r) => r.label === 'Avg. surface temp')!
    expect(tempRow.chosen).toBe('100°F')
    expect(tempRow.better).toBe(true) // equal is fine
  })
})

describe('tempColor', () => {
  it('maps warmth onto the heat ramp', () => {
    expect(tempColor(0)).toBe('rgb(49,46,129)')
    expect(tempColor(1)).toBe('rgb(220,38,38)')
    const mid = tempColor(0.5)
    expect(mid).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    expect(tempColor(-5)).toBe(tempColor(0))
    expect(tempColor(9)).toBe(tempColor(1))
  })
})
