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
  locating: boolean
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

export default function HazardDrawer({
  open,
  categories,
  pin,
  pickMode,
  locating,
  onPickPin,
  onLocate,
  onSubmit,
  onClose,
}: HazardDrawerProps) {
  const [category, setCategory] = useState('broken_sidewalk')
  const [severity, setSeverity] = useState(3)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const close = () => {
    setError(null)
    setSuccess(null)
    onClose()
  }

  if (!open) return null

  const submit = async () => {
    if (!pin) {
      setError('Choose where it is: use your location or drop a pin on the map.')
      return
    }
    setSubmitting(true)
    setError(null)
    const submitError = await onSubmit({ category, severity, note, lat: pin[1], lon: pin[0] })
    setSubmitting(false)
    if (submitError) {
      setError(submitError)
      return
    }
    setSuccess('Thanks — this block’s route score has been updated.')
    setNote('')
    window.setTimeout(close, 1600)
  }

  return (
    <aside className="hazard-drawer" aria-label="Report a hazard">
      <div className="hazard-drawer-header">
        <div>
          <h2>Report a walking hazard</h2>
          <p>Help other people choose a better route.</p>
        </div>
        <button className="icon-button muted" type="button" aria-label="Close report" onClick={close}>×</button>
      </div>

      <div className="hazard-categories" role="radiogroup" aria-label="Hazard type">
        {categories.map((item) => (
          <button
            key={item.id}
            className={`hazard-category ${category === item.id ? 'is-selected' : ''}`}
            type="button"
            role="radio"
            aria-checked={category === item.id}
            onClick={() => setCategory(item.id)}
          >
            <span>{HAZARD_ICONS[item.id] ?? 'Other'}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="severity-row">
        <label htmlFor="hazard-severity">Severity <b>{severity}/5</b></label>
        <input
          id="hazard-severity"
          type="range"
          min={1}
          max={5}
          value={severity}
          onChange={(event) => setSeverity(Number(event.target.value))}
        />
      </div>

      <label className="hazard-note-label" htmlFor="hazard-note">Optional note</label>
      <textarea
        id="hazard-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What should walkers know?"
        maxLength={280}
        rows={2}
      />

      <div className={`hazard-location ${pin ? 'is-set' : ''}`}>
        <span className="hazard-location-dot" aria-hidden="true" />
        <span>{pin ? `${pin[1].toFixed(5)}, ${pin[0].toFixed(5)}` : 'No location selected'}</span>
        <button type="button" onClick={onPickPin}>{pickMode ? 'Click map…' : 'Drop pin'}</button>
        <button type="button" title="Use my location" onClick={onLocate} disabled={locating}>{locating ? '…' : '◎'}</button>
      </div>

      {error && <p className="hazard-message error" role="alert">{error}</p>}
      {success && <p className="hazard-message success">{success}</p>}
      <button className="submit-hazard-button" type="button" disabled={submitting} onClick={() => void submit()}>
        {submitting ? 'Sending report…' : 'Submit report'}
      </button>
      <p className="hazard-fine-print">Reports influence nearby route recommendations and fade as conditions change.</p>
    </aside>
  )
}
