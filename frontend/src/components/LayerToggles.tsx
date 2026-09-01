import type { LayerToggles as Toggles } from './MapView'

interface LayerTogglesProps {
  layers: Toggles
  onToggle: (key: keyof Toggles) => void
}

const LABELS: { key: keyof Toggles; label: string }[] = [
  { key: 'conditions', label: 'Road score' },
  { key: 'heat', label: 'Heat' },
  { key: 'canopy', label: 'Canopy' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'hazards', label: 'Hazards' },
]

export default function LayerToggles({ layers, onToggle }: LayerTogglesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {LABELS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onToggle(key)}
          className={`chip border transition-colors ${
            layers[key]
              ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
              : 'border-slate-700 bg-slate-900/70 text-slate-500'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
