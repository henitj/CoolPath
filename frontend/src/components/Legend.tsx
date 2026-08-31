import { tempColor } from '../utils/format'

export default function Legend() {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1]
  return (
    <div className="panel flex items-center gap-2 px-3 py-2 text-[11px]">
      <span className="uppercase tracking-wide text-slate-500">Heat</span>
      <div className="flex overflow-hidden rounded-full">
        {stops.map((s) => (
          <span key={s} className="h-2.5 w-7" style={{ background: tempColor(s) }} />
        ))}
      </div>
      <span className="text-slate-500">cooler → hotter surface (LST)</span>
    </div>
  )
}
