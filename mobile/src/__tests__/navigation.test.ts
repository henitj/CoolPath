import { describe, expect, it } from 'vitest'
import { currentStep, routeProgress } from '../navigation'
import type { RouteStep } from '../types'

const LINE: [number, number][] = [
  [-97.7430, 30.2670],
  [-97.7420, 30.2670],
  [-97.7410, 30.2670],
]

const STEPS: RouteStep[] = [
  {
    instruction: 'Head east on First Street',
    street: 'First Street',
    maneuver: 'depart',
    distance_m: 96,
    duration_min: 1.2,
    coordinate_index: 0,
  },
  {
    instruction: 'Turn left onto Second Street',
    street: 'Second Street',
    maneuver: 'turn-left',
    distance_m: 96,
    duration_min: 1.2,
    coordinate_index: 1,
  },
  {
    instruction: 'Arrive at destination',
    street: '',
    maneuver: 'arrive',
    distance_m: 0,
    duration_min: 0,
    coordinate_index: 2,
  },
]

describe('routeProgress', () => {
  it('matches a walker in the middle of a route segment', () => {
    const progress = routeProgress(LINE, { lat: 30.2670, lon: -97.7425 })
    expect(progress.nearestDistanceM).toBeLessThan(1)
    expect(progress.progress).toBeGreaterThan(0.2)
    expect(progress.progress).toBeLessThan(0.3)
    expect(progress.remainingM).toBeGreaterThan(100)
  })

  it('advances the geometry index near the end of a segment', () => {
    const progress = routeProgress(LINE, { lat: 30.2670, lon: -97.74205 })
    expect(progress.nearestIndex).toBe(1)
  })

  it('returns a safe empty result for a route with fewer than two points', () => {
    expect(routeProgress([], { lat: 30.267, lon: -97.742 })).toEqual({
      nearestIndex: 0,
      nearestDistanceM: 0,
      remainingM: 0,
      progress: 0,
    })
  })
})

describe('currentStep', () => {
  it('uses the latest reached maneuver and keeps arrival last', () => {
    expect(currentStep(STEPS, 0)?.step.maneuver).toBe('depart')
    expect(currentStep(STEPS, 1)?.step.maneuver).toBe('turn-left')
    expect(currentStep(STEPS, 99)?.step.maneuver).toBe('arrive')
  })

  it('has no maneuver for an empty route response', () => {
    expect(currentStep([], 0)).toBeNull()
  })
})
