import { useState } from 'react'
import { HAZARD_ICONS } from '../constants'

export interface HazardCategoryMeta {
  id: string
  label: string
  color: string
  weight: number
}

interface HazardDrawerProps {
  open: boolean
  categories: HazardCategoryMeta[]
  pin: [number, number] | null
  pickMode: boolean
  onPickPin: () => void
  onLocate: () => void
  onSubmit: (payload: {
    category: string
    severity: number
    note: string
    lat: number
    lon: number
  }) => Promise<string | null>
  onClose: () => void
}

export default function HazardDrawer(props: HazardDrawerProps) {
  const [category, setCategory] = useState('broken_sidewalk')
  const [severity, setSeverity] = useState(3)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!props.open) return null

  const submit = async () => {
    if (!props.pin) {
      setError('Drop a pin on the map first (or use ⌖ my location).')
      return
    }
    setSubmitting(true)
    setError(null)
    const err = await props.onSubmit({ category, severity, note, lat: props.pin[1], lon: props.pin[0] })
    setSubmitting(false)
    if (err) {
      setError(err)
    } else {
      setSuccess('Hazard reported — nearby route scores updated immediately.')
      setNote('')
      setTimeout(() => {
        setSuccess(null)
        props.onClose()
      }, 1400)
    }
  }

  return (
    <aside className="absolute right-3 top-3 z-20 w-[320px] rounded-xl border border-slate-600/70 bg-slate-900/95 p-4 shadow-panel backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100">Report a hazard</h3>
        <button className="text-slate-400 hover:text-slate-200" onClick={props.onClose}>✕</button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {props.categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12px] transition-colors ${
              category === c.id
                ? 'border-transparent bg-slate-800 ring-2 ring-cyan-400/60'
                : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800/70'
            }`}
          >
            <span>{HAZARD_ICONS[c.id] ?? '📍'}</span>
            <span className="leading-tight text-slate-200">{c.label}</span>
          </button>
        ))}
      </div>

      <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
        Severity: <span className="font-bold text-slate-200">{severity}/5</span>
      </label>
      <input
        type="range"
        min={1}
        max={5}
        value={severity}
        onChange={(e) => setSeverity(Number(e.target.value))}
        className="mb-3 w-full"
      />

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (max 280 chars)"
        maxLength={280}
        rows={2}
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
      />

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-slate-600 px-2.5 py-2">
        <span className={`h-2.5 w-2.5 rounded-full ${props.pin ? 'bg-orange-400' : 'bg-slate-600'}`} />
        <span className="flex-1 font-mono text-[11px] text-slate-400">
          {props.pin ? `${props.pin[1].toFixed(4)}, ${props.pin[0].toFixed(4)}` : 'no pin set'}
        </span>
        <button
          className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
            props.pickMode ? 'bg-cyan-500 text-slate-950' : 'border border-slate-600 text-slate-300 hover:bg-slate-800'
          }`}
          onClick={props.onPickPin}
        >
          {props.pickMode ? 'clicking map…' : 'Drop pin'}
        </button>
        <button
          className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
          onClick={props.onLocate}
          title="Use my location"
        >
          ⌖
        </button>
      </div>

      {error && <p className="mb-2 rounded-md bg-rose-500/10 px-2 py-1 text-[12px] text-rose-300">{error}</p>}
      {success && (
        <p className="mb-2 rounded-md bg-emerald-500/10 px-2 py-1 text-[12px] text-emerald-300">{success}</p>
      )}

      <button className="btn-primary w-full" disabled={submitting} onClick={submit}>
        {submitting ? 'Reporting…' : 'Submit report'}
      </button>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Reports decay route scores within a 50 m buffer and fade out over ~48 h.
      </p>
    </aside>
  )
}
