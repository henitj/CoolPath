import { describe, expect, it } from 'vitest'
import { FALLBACK_PLACES, filterPlaces, kindMeta, nearestPlace } from '../places'
import { routeDistanceM } from '../format'
import type { Place } from '../types'

describe('fallback places', () => {
  it('are unique and inside downtown Austin', () => {
    const ids = FALLBACK_PLACES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of FALLBACK_PLACES) {
      expect(p.lon).toBeGreaterThan(-97.76)
      expect(p.lon).toBeLessThan(-97.72)
      expect(p.lat).toBeGreaterThan(30.25)
      expect(p.lat).toBeLessThan(30.28)
    }
  })
})

describe('filterPlaces', () => {
  it('matches name, kind and blurb; empty query returns all', () => {
    expect(filterPlaces(FALLBACK_PLACES, '')).toHaveLength(FALLBACK_PLACES.length)
    expect(filterPlaces(FALLBACK_PLACES, 'park').length).toBeGreaterThan(1)
    expect(filterPlaces(FALLBACK_PLACES, 'CAPITOL')[0].id).toBe('texas-state-capitol')
    expect(filterPlaces(FALLBACK_PLACES, 'zzzz')).toHaveLength(0)
  })
})

describe('kindMeta', () => {
  it('falls back for unknown kinds', () => {
    expect(kindMeta('park').emoji).toBe('🌳')
    expect(kindMeta('whatever').label).toBe('Place')
  })
})

describe('nearestPlace', () => {
  it('finds the closest spot to a coordinate', () => {
    const p = nearestPlace(FALLBACK_PLACES, 30.2745, -97.737)
    expect(p?.id).toBe('texas-state-capitol')
    expect(nearestPlace([], 30, -97)).toBeNull()
  })
})

describe('routeDistanceM', () => {
  it('sums polyline legs', () => {
    const coords: [number, number][] = [
      [-97.7425, 30.2674],
      [-97.7425, 30.2683],
      [-97.7425, 30.2692],
    ]
    const d = routeDistanceM(coords)
    expect(d).toBeGreaterThan(190)
    expect(d).toBeLessThan(240)
    expect(routeDistanceM([])).toBe(0)
  })
})

describe('place type integrity', () => {
  it('keeps required fields present', () => {
    const p: Place = FALLBACK_PLACES[0]
    expect(p.id && p.name && p.blurb && p.kind).toBeTruthy()
  })
})
