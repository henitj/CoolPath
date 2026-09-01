import { haversineM } from './format'
import type { RouteStep } from './types'

export interface RouteProgress {
  nearestIndex: number
  nearestDistanceM: number
  remainingM: number
  progress: number
}

/**
 * Project a phone location onto route segments rather than only route vertices.
 * This keeps a walker on-route in the middle of a long Downtown Austin block.
 */
export function routeProgress(
  line: readonly (readonly [number, number])[],
  point: { lat: number; lon: number },
): RouteProgress {
  if (line.length < 2) return { nearestIndex: 0, nearestDistanceM: 0, remainingM: 0, progress: 0 }

  let travelled = 0
  let routeLength = 0
  const segmentLengths = line.slice(1).map(([lon, lat], index) => {
    const [priorLon, priorLat] = line[index]
    const length = haversineM(priorLat, priorLon, lat, lon)
    routeLength += length
    return length
  })
  let nearestIndex = 0
  let nearestDistanceM = Number.POSITIVE_INFINITY
  let distanceAlongRoute = 0
  const longitudeScale = 111_320 * Math.cos((point.lat * Math.PI) / 180)
  const latitudeScale = 110_540

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const [startLon, startLat] = line[index]
    const [endLon, endLat] = line[index + 1]
    const ax = (startLon - point.lon) * longitudeScale
    const ay = (startLat - point.lat) * latitudeScale
    const bx = (endLon - point.lon) * longitudeScale
    const by = (endLat - point.lat) * latitudeScale
    const dx = bx - ax
    const dy = by - ay
    const segmentSquared = dx * dx + dy * dy
    const fraction = segmentSquared > 0
      ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / segmentSquared))
      : 0
    const projectedX = ax + fraction * dx
    const projectedY = ay + fraction * dy
    const distance = Math.hypot(projectedX, projectedY)
    if (distance < nearestDistanceM) {
      nearestDistanceM = distance
      // Keep the current street instruction visible until the walker is close
      // to the next vertex, then advance to the following instruction.
      nearestIndex = fraction >= 0.92 ? index + 1 : index
      distanceAlongRoute = travelled + segmentLengths[index] * fraction
    }
    travelled += segmentLengths[index]
  }

  const remainingM = Math.max(0, routeLength - distanceAlongRoute)
  const measuredTotal = Math.max(routeLength, 1)
  return {
    nearestIndex,
    nearestDistanceM,
    remainingM,
    progress: Math.max(0, Math.min(1, 1 - remainingM / measuredTotal)),
  }
}

/** Return the latest maneuver whose geometry coordinate has been reached. */
export function currentStep(
  steps: readonly RouteStep[],
  coordinateIndex: number,
): { step: RouteStep; index: number } | null {
  if (!steps.length) return null
  let candidate = 0
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index].coordinate_index <= coordinateIndex) candidate = index
    else break
  }
  return { step: steps[candidate], index: candidate }
}
