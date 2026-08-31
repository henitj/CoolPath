import type { Metrics } from '../types'

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.round(meters)} m`
}

export function formatTemp(celsius: number, unit: 'C' | 'F' = 'C'): string {
  if (unit === 'F') return `${Math.round((celsius * 9) / 5 + 32)}°F`
  return `${celsius.toFixed(1)}°C`
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function formatDelta(value: number, digits = 1, suffix = ''): string {
  const rounded = value.toFixed(digits)
  if (value > 0) return `+${rounded}${suffix}`
  return `${rounded}${suffix}`
}

export interface MetricRow {
  label: string
  chosen: string
  baseline: string
  /** positive means the chosen route is better (used for colouring) */
  better: boolean | null
}

/** Build the side-by-side comparison rows for the metrics panel. */
export function comparisonRows(chosen: Metrics, baseline: Metrics, unit: 'C' | 'F'): MetricRow[] {
  return [
    {
      label: 'Distance',
      chosen: formatDistance(chosen.distance_m),
      baseline: formatDistance(baseline.distance_m),
      better: chosen.distance_m <= baseline.distance_m ? true : false,
    },
    {
      label: 'Avg. surface temp',
      chosen: formatTemp(chosen.avg_temp_c, unit),
      baseline: formatTemp(baseline.avg_temp_c, unit),
      better: chosen.avg_temp_c <= baseline.avg_temp_c,
    },
    {
      label: 'Max surface temp',
      chosen: formatTemp(chosen.max_temp_c, unit),
      baseline: formatTemp(baseline.max_temp_c, unit),
      better: chosen.max_temp_c <= baseline.max_temp_c,
    },
    {
      label: 'Shaded (canopy+shadow)',
      chosen: `${chosen.shade_pct.toFixed(0)}%`,
      baseline: `${baseline.shade_pct.toFixed(0)}%`,
      better: chosen.shade_pct >= baseline.shade_pct,
    },
    {
      label: 'Tree canopy',
      chosen: `${chosen.canopy_pct.toFixed(0)}%`,
      baseline: `${baseline.canopy_pct.toFixed(0)}%`,
      better: chosen.canopy_pct >= baseline.canopy_pct,
    },
    {
      label: 'Hazards nearby',
      chosen: String(chosen.hazard_count),
      baseline: String(baseline.hazard_count),
      better: chosen.hazard_count <= baseline.hazard_count,
    },
    {
      label: 'Comfort score',
      chosen: chosen.comfort_score.toFixed(0),
      baseline: baseline.comfort_score.toFixed(0),
      better: chosen.comfort_score >= baseline.comfort_score,
    },
  ]
}

/** Temperature -> colour ramp used by the legend + heat layer. */
export function tempColor(warmth: number): string {
  const stops: [number, [number, number, number]][] = [
    [0.0, [49, 46, 129]], // indigo-900
    [0.35, [14, 165, 233]], // sky-500
    [0.55, [250, 204, 21]], // yellow-400
    [0.75, [249, 115, 22]], // orange-500
    [1.0, [220, 38, 38]], // red-600
  ]
  const w = Math.max(0, Math.min(1, warmth))
  for (let i = 1; i < stops.length; i++) {
    if (w <= stops[i][0]) {
      const [t0, c0] = stops[i - 1]
      const [t1, c1] = stops[i]
      const t = (w - t0) / (t1 - t0)
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * t))
      return `rgb(${c[0]},${c[1]},${c[2]})`
    }
  }
  return 'rgb(220,38,38)'
}
