import { austinTodayAt } from '../utils/time'

interface TimeSliderProps {
  hour: number
  onHour: (h: number) => void
  onNow: () => void
  isNow: boolean
}

const HOUR_LABELS: Record<number, string> = {
  6: '6a', 9: '9a', 12: '12p', 15: '3p', 18: '6p', 21: '9p',
}

export default function TimeSlider({ hour, onHour, onNow, isNow }: TimeSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">Sun & shadows</span>
      <input
        type="range"
        min={5}
        max={21}
        step={0.25}
        value={hour}
        onChange={(e) => onHour(Number(e.target.value))}
        className="w-56"
      />
      <span className="w-16 font-mono text-xs text-cyan-300">
        {formatHour(hour)} <span className="text-slate-500">CT</span>
      </span>
      <button
        onClick={onNow}
        className={`chip border ${isNow ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 bg-slate-900/70 text-slate-400'}`}
        title="Reset to current time"
      >
        now
      </button>
    </div>
  )
}

function formatHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ampm = hh >= 12 ? 'pm' : 'am'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return mm ? `${h12}:${String(mm).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

export { austinTodayAt, HOUR_LABELS }
