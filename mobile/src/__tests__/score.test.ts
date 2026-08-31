import { describe, expect, it } from 'vitest'
import {
  coachingTip,
  hazardEmoji,
  profileCopy,
  shadeLabel,
  sunTip,
  tempBand,
  verdictForComfort,
} from '../score'

describe('verdictForComfort', () => {
  it('rises from hot to good as comfort improves', () => {
    expect(verdictForComfort(5).tone).toBe('hot')
    expect(verdictForComfort(35).tone).toBe('warm')
    expect(verdictForComfort(55).tone).toBe('mild')
    expect(verdictForComfort(85).tone).toBe('good')
  })
  it('always carries a calm message and colour', () => {
    for (const c of [0, 30, 50, 90]) {
      const v = verdictForComfort(c)
      expect(v.message.length).toBeGreaterThan(5)
      expect(v.color).toMatch(/^#/)
      expect(v.emoji.length).toBeGreaterThan(0)
    }
  })
})

describe('tempBand / shadeLabel / sunTip', () => {
  it('bands surface heat', () => {
    expect(tempBand(28).label).toBe('Cool pavement')
    expect(tempBand(38).label).toBe('Warm surface')
    expect(tempBand(43).label).toBe('Hot surface')
  })
  it('labels shade gently', () => {
    expect(shadeLabel(80)).toBe('Well shaded')
    expect(shadeLabel(40)).toBe('Partly shaded')
    expect(shadeLabel(3)).toBe('Mostly exposed')
  })
  it('sun tips cover night and low/high sun', () => {
    expect(sunTip(-10, false)).toContain('Night')
    expect(sunTip(15, true)).toContain('Low sun')
    expect(sunTip(75, true)).toContain('High sun')
    expect(sunTip(45, true)).toContain('Mid sun')
  })
})

describe('profileCopy & hazardEmoji', () => {
  it('describes the three paths', () => {
    expect(profileCopy('cool').title).toBe('Coolest')
    expect(profileCopy('safe').title).toBe('Easiest')
    expect(profileCopy('fastest').title).toBe('Shortest')
  })
  it('maps every hazard category and falls back', () => {
    expect(hazardEmoji('flooding')).toBe('🌊')
    expect(hazardEmoji('mystery')).toBe('📍')
  })
})

describe('coachingTip', () => {
  it('prioritises heat warnings over pleasantries', () => {
    const hot = coachingTip({ comfort: 20, shadePct: 10, tempC: 42, isDaytime: true })
    expect(hot.toLowerCase()).toContain('hot')
    const nice = coachingTip({ comfort: 80, shadePct: 70, tempC: 30, isDaytime: true })
    expect(nice.toLowerCase()).toContain('shaded')
    const night = coachingTip({ comfort: 50, shadePct: 10, tempC: 30, isDaytime: false })
    expect(night.toLowerCase()).toContain('lit')
  })
})
