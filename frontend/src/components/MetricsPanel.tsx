import { useState } from 'react'
import type { RouteResponse } from '../types'
import { comparisonRows, formatDistance, formatMinutes, formatTemp } from '../utils/format'

interface MetricsPanelProps {
  route: RouteResponse | null
}

export default function MetricsPanel({ route }: MetricsPanelProps) {
  const [unit, setUnit] = useState<'C' | 'F'>('F')
  if (!route) {
    return (
      <section className="panel p-3 text-sm text-slate-400">
        Pick origin & destination on the map, then choose a profile. CoolPath will compare the
        micro-climate exposure of your route against the plain fastest path.
      </section>
    )
  }

  const m = route.properties.metrics
  const cmp = route.comparison
  const baseline = route.baseline
  const rows = baseline ? comparisonRows(m, baseline.properties.metrics, unit) : []

  return (
    <section className="panel scroll-thin max-h-[46vh] overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Route comparison
        </h2>
        <div className="flex rounded-md border border-slate-700 text-[11px]">
          {(['C', 'F'] as const).map((u) => (
            <button
              key={u}
              className={`px-2 py-0.5 ${unit === u ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'}`}
              onClick={() => setUnit(u)}
            >
              °{u}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-cyan-200">{route.properties.label}</span>
          <span className="font-mono text-xs text-slate-300">
            {formatDistance(m.distance_m)} · {formatMinutes(m.est_walk_min)}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Metric label="Avg surface" value={formatTemp(m.avg_temp_c, unit)} />
          <Metric label="Shaded" value={`${m.shade_pct.toFixed(0)}%`} />
          <Metric label="Comfort" value={m.comfort_score.toFixed(0)} accent="text-cyan-300" />
        </div>
      </div>

      {cmp && baseline && (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-1 font-medium">Metric</th>
              <th className="pb-1 text-right font-medium text-cyan-300">{route.properties.label}</th>
              <th className="pb-1 text-right font-medium text-slate-400">Fastest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="py-1.5 text-slate-300">{row.label}</td>
                <td className={`py-1.5 text-right font-semibold ${row.better ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {row.chosen}
                </td>
                <td className="py-1.5 text-right text-slate-400">{row.baseline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cmp && (
        <div className="mt-3 rounded-lg bg-slate-800/60 p-2.5 text-[12px] leading-relaxed text-slate-300">
          {cmp.distance_delta_pct > 0.5 ? (
            <span>
              The shaded route is <b className="text-amber-300">{cmp.distance_delta_m.toFixed(0)} m longer</b>
              {' '}(+{cmp.distance_delta_pct.toFixed(0)}%) but exposes you to{' '}
              <b className="text-cyan-300">
                {Math.abs(cmp.temp_delta_c).toFixed(1)}°C less surface heat
              </b>{' '}
              and <b className="text-emerald-300">{cmp.shade_delta_pct.toFixed(0)} pct-points more shade</b>.
            </span>
          ) : (
            <span>
              The chosen route matches the fastest path within {Math.abs(cmp.distance_delta_m).toFixed(0)} m
              while changing shade by {cmp.shade_delta_pct.toFixed(0)} pct-points.
            </span>
          )}
        </div>
      )}

      {route.properties.warnings && route.properties.warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-amber-300/80">
          {route.properties.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Metric(props: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md bg-slate-800/70 px-1 py-1.5">
      <div className={`text-sm font-bold ${props.accent ?? 'text-slate-100'}`}>{props.value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{props.label}</div>
    </div>
  )
}
