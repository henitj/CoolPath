import { useGeolocation } from '../hooks/useGeolocation'
import type { ProfileId } from '../types'
import { PROFILE_CARDS } from '../constants'

interface RoutingPanelProps {
  profile: ProfileId
  onProfile: (p: ProfileId) => void
  origin: [number, number] | null
  destination: [number, number] | null
  pickMode: 'origin' | 'destination' | null
  onPick: (which: 'origin' | 'destination' | null) => void
  onSetCoord: (which: 'origin' | 'destination', coord: [number, number]) => void
  onSwap: () => void
  onGo: () => void
  onClear: () => void
  loading: boolean
  error: string | null
  canRoute: boolean
}

function CoordRow(props: {
  label: string
  which: 'origin' | 'destination'
  coord: [number, number] | null
  active: boolean
  onPick: RoutingPanelProps['onPick']
  onLocate: (which: 'origin' | 'destination') => void
}) {
  const { label, which, coord, active, onPick, onLocate } = props
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${active ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/50'}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${which === 'origin' ? 'bg-cyan-400' : 'bg-orange-400'}`} />
      <button className="flex-1 text-left text-sm" onClick={() => onPick(active ? null : which)}>
        <div className="font-medium text-slate-200">{label}</div>
        <div className="font-mono text-[11px] text-slate-400">
          {coord ? `${coord[1].toFixed(4)}, ${coord[0].toFixed(4)}` : 'click map or use location'}
        </div>
      </button>
      <button
        title="Use my location"
        className="rounded-md px-1.5 py-1 text-slate-400 hover:bg-slate-700/60 hover:text-cyan-300"
        onClick={() => onLocate(which)}
      >
        Locate
      </button>
    </div>
  )
}

export default function RoutingPanel(props: RoutingPanelProps) {
  const geo = useGeolocation()

  const locateFor = (which: 'origin' | 'destination') => {
    geo.locate()
    // the hook resolves asynchronously; poll briefly
    const started = Date.now()
    const iv = setInterval(() => {
      if (geo.coords) {
        props.onSetCoord(which, geo.coords)
        clearInterval(iv)
      } else if (Date.now() - started > 9000) {
        clearInterval(iv)
      }
    }, 250)
  }

  return (
    <section className="panel p-3">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Routing profiles</h2>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {PROFILE_CARDS.map((p) => (
          <button
            key={p.id}
            onClick={() => props.onProfile(p.id)}
            title={p.blurb}
            className={`rounded-lg border px-2 py-2 text-center transition-all ${
              props.profile === p.id
                ? `border-transparent bg-slate-800 ring-2 ${p.ring}`
                : 'border-slate-700/70 bg-slate-900/40 hover:bg-slate-800/60'
            }`}
          >
            <div className={`mt-1 text-[11px] font-semibold leading-tight ${props.profile === p.id ? p.accent : 'text-slate-400'}`}>
              {p.label}
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <CoordRow
          label="Origin"
          which="origin"
          coord={props.origin}
          active={props.pickMode === 'origin'}
          onPick={props.onPick}
          onLocate={locateFor}
        />
        <CoordRow
          label="Destination"
          which="destination"
          coord={props.destination}
          active={props.pickMode === 'destination'}
          onPick={props.onPick}
          onLocate={locateFor}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={!props.canRoute || props.loading}
          onClick={props.onGo}
        >
          {props.loading ? 'Routing…' : 'Find route'}
        </button>
        <button className="btn border border-slate-600 bg-slate-800/70 text-slate-300 hover:bg-slate-700" title="Swap" onClick={props.onSwap}>
          ⇅
        </button>
        <button className="btn border border-slate-700 bg-transparent text-slate-400 hover:text-slate-200" title="Clear" onClick={props.onClear}>
          ✕
        </button>
      </div>

      {geo.coords && geo.error === null && (
        <p className="mt-1.5 text-[11px] text-emerald-400/80">Located: {geo.coords[1].toFixed(4)}, {geo.coords[0].toFixed(4)}</p>
      )}
      {(geo.error || props.error) && (
        <p className="mt-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
          {geo.error ?? props.error}
        </p>
      )}
    </section>
  )
}
