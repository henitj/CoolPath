import type { SatelliteStatus } from '../types'

interface StatusBarProps {
  status: SatelliteStatus | null
  refreshing: boolean
  onRefresh: () => void
}

const SHORT_NAMES: Record<string, string> = {
  sentinel2_ndvi: 'Sentinel-2 NDVI',
  landsat_lst: 'Landsat LST',
  austin_canopy: 'ATX Canopy',
  osm_overpass: 'OSM Network',
}

export default function StatusBar({ status, refreshing, onRefresh }: StatusBarProps) {
  return (
    <section className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-[11px]">
      <span className="font-bold uppercase tracking-wider text-slate-400">Data</span>
      {status ? (
        status.sources.map((s) => (
          <span
            key={s.key}
            title={`${s.name}\n${s.detail}\n${s.checked_at ?? 'not checked yet'}`}
            className={`chip border ${
              s.mode === 'live'
                ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-600 bg-slate-800/60 text-slate-400'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${s.mode === 'live' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {SHORT_NAMES[s.key] ?? s.key}
            <span className="text-slate-500">{s.mode === 'live' ? '· live' : '· snapshot'}</span>
          </span>
        ))
      ) : (
        <span className="text-slate-500">loading sources…</span>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="chip border border-slate-600 bg-slate-800/70 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
        title="Try live satellite / open-data refresh (falls back to snapshot automatically)"
      >
        {refreshing ? '⟳ refreshing…' : '⟳ refresh live data'}
      </button>
    </section>
  )
}
