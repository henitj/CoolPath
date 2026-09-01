import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { PROFILE_CARDS } from '../constants'
import type { MapLocation, Place, ProfileId } from '../types'

export type RouteField = 'origin' | 'destination'

interface DirectionsPanelProps {
  origin: MapLocation | null
  destination: MapLocation | null
  places: Place[]
  profile: ProfileId
  pickMode: RouteField | null
  locating: boolean
  loading: boolean
  error: string | null
  onSelect: (field: RouteField, location: MapLocation) => void
  onClearField: (field: RouteField) => void
  onPickOnMap: (field: RouteField | null) => void
  onUseLocation: (field: RouteField) => void
  onProfile: (profile: ProfileId) => void
  onSwap: () => void
  onClear: () => void
  onRoute: () => void
}

interface Draft {
  text: string
  /** The parent selection this draft belongs to; null means free-form typing. */
  selectionId: string | null
}

const EMPTY_PLACES: Place[] = []

const FIELD_META: Record<RouteField, { label: string; placeholder: string; dot: string }> = {
  origin: { label: 'Starting point', placeholder: 'Your location', dot: 'origin' },
  destination: { label: 'Destination', placeholder: 'Where are you going?', dot: 'destination' },
}

export default function DirectionsPanel({
  origin,
  destination,
  places,
  profile,
  pickMode,
  locating,
  loading,
  error,
  onSelect,
  onClearField,
  onPickOnMap,
  onUseLocation,
  onProfile,
  onSwap,
  onClear,
  onRoute,
}: DirectionsPanelProps) {
  const [activeField, setActiveField] = useState<RouteField | null>(null)
  const [drafts, setDrafts] = useState<Record<RouteField, Draft>>({
    origin: { text: '', selectionId: null },
    destination: { text: '', selectionId: null },
  })
  const [search, setSearch] = useState<{ key: string; places: Place[]; loading: boolean }>({
    key: '',
    places: [],
    loading: false,
  })
  const searchVersion = useRef(0)

  const selectedFor = (field: RouteField) => field === 'origin' ? origin : destination
  const textFor = (field: RouteField) => {
    const selected = selectedFor(field)
    const draft = drafts[field]
    return draft.selectionId === (selected?.id ?? null) ? draft.text : (selected?.name ?? '')
  }
  const activeText = activeField ? textFor(activeField) : ''
  const searchKey = activeField ? `${activeField}:${activeText.trim().toLocaleLowerCase()}` : ''
  const localMatches = useMemo(() => filterPlaces(places, activeText), [places, activeText])
  const remoteMatches = search.key === searchKey ? search.places : EMPTY_PLACES
  const isSearching = search.key === searchKey && search.loading
  const suggestions = useMemo(() => mergePlaces(localMatches, remoteMatches), [localMatches, remoteMatches])

  useEffect(() => {
    if (!activeField || activeText.trim().length < 2) return
    const key = `${activeField}:${activeText.trim().toLocaleLowerCase()}`
    const version = ++searchVersion.current
    const timer = window.setTimeout(() => {
      setSearch({ key, places: [], loading: true })
      void api
        .searchPlaces(activeText.trim())
        .then((response) => {
          if (searchVersion.current === version) setSearch({ key, places: response.places, loading: false })
        })
        .catch(() => {
          // Local matches remain useful while the API is starting or offline.
          if (searchVersion.current === version) setSearch({ key, places: [], loading: false })
        })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [activeField, activeText])

  const setTextFor = (field: RouteField, text: string) => {
    const selected = selectedFor(field)
    const changedSelection = Boolean(selected && text !== selected.name)
    setDrafts((current) => ({
      ...current,
      [field]: { text, selectionId: changedSelection ? null : (selected?.id ?? null) },
    }))
    if (changedSelection) onClearField(field)
    setActiveField(field)
  }

  const selectPlace = (field: RouteField, place: Place) => {
    setDrafts((current) => ({
      ...current,
      [field]: { text: place.name, selectionId: place.id },
    }))
    onSelect(field, {
      id: place.id,
      name: place.name,
      coordinates: [place.lon, place.lat],
      detail: place.blurb,
      source: place.id.startsWith('coordinates-') ? 'coordinates' : 'search',
    })
    setActiveField(null)
    onPickOnMap(null)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (activeField && suggestions[0]) {
      selectPlace(activeField, suggestions[0])
      return
    }
    if (origin && destination) onRoute()
  }

  const chooseLocation = (field: RouteField) => {
    onUseLocation(field)
    setActiveField(null)
    onPickOnMap(null)
  }

  return (
    <section className="directions-card" aria-label="Route planner">
      <div className="directions-heading">
        <div className="brand-mark" aria-hidden="true">⌁</div>
        <div>
          <h1>CoolPath</h1>
          <p>Comfort-aware walking · Downtown Austin</p>
        </div>
        <button className="icon-button muted" type="button" title="Clear route" aria-label="Clear route" onClick={onClear}>
          ×
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="stops-shell">
          <span className="stops-line" aria-hidden="true" />
          {(['origin', 'destination'] as const).map((field) => {
            const meta = FIELD_META[field]
            const isActive = activeField === field || pickMode === field
            return (
              <div className="stop-row" key={field}>
                <span className={`stop-dot ${meta.dot}`} aria-hidden="true" />
                <label className="sr-only" htmlFor={`route-${field}`}>{meta.label}</label>
                <input
                  id={`route-${field}`}
                  className={`place-input ${isActive ? 'is-active' : ''}`}
                  value={textFor(field)}
                  placeholder={meta.placeholder}
                  autoComplete="off"
                  onChange={(event) => setTextFor(field, event.target.value)}
                  onFocus={() => {
                    setActiveField(field)
                    onPickOnMap(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setActiveField(null)
                  }}
                />
                <button
                  className={`map-pick-button ${pickMode === field ? 'is-active' : ''}`}
                  type="button"
                  title={`Pick ${field} on map`}
                  aria-label={`Pick ${field} on map`}
                  onClick={() => {
                    setActiveField(null)
                    onPickOnMap(pickMode === field ? null : field)
                  }}
                >
                  ◎
                </button>
              </div>
            )
          })}
          <button className="swap-button" type="button" title="Swap starting point and destination" onClick={onSwap}>⇅</button>
        </div>

        {activeField && (
          <div className="suggestions" role="listbox" aria-label={`${FIELD_META[activeField].label} suggestions`}>
            <button className="suggestion current-location" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseLocation(activeField)}>
              <span className="suggestion-icon">{locating ? '◌' : '◎'}</span>
              <span>
                <b>{locating ? 'Finding your location…' : 'Use my current location'}</b>
                <small>Use your device’s GPS location</small>
              </span>
            </button>
            {suggestions.slice(0, 6).map((place) => (
              <button
                className="suggestion"
                key={place.id}
                type="button"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPlace(activeField, place)}
              >
                <span className="suggestion-icon">{placeIcon(place.kind)}</span>
                <span>
                  <b>{place.name}</b>
                  <small>{place.blurb}</small>
                </span>
              </button>
            ))}
            {activeText.trim().length >= 2 && !isSearching && suggestions.length === 0 && (
              <p className="no-suggestions">No downtown match yet. Choose a point on the map or paste coordinates.</p>
            )}
            {isSearching && <p className="searching-copy">Looking through downtown places…</p>}
          </div>
        )}

        <div className="route-options">
          <span>Prioritize</span>
          <div className="profile-pills" aria-label="Route preference">
            {PROFILE_CARDS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`profile-pill ${profile === option.id ? 'is-selected' : ''}`}
                onClick={() => onProfile(option.id)}
                title={option.blurb}
              >
                {option.label === 'Cool & Shaded' ? 'Coolest' : option.label}
              </button>
            ))}
          </div>
        </div>

        <button className="find-route-button" type="submit" disabled={!origin || !destination || loading}>
          {loading ? 'Finding your route…' : 'Find best route'}
          {!loading && <span aria-hidden="true">→</span>}
        </button>
      </form>

      {pickMode && <p className="map-pick-hint">Click anywhere on the map to set your {pickMode}.</p>}
      {error && <p className="route-error" role="alert">{error}</p>}
    </section>
  )
}

function filterPlaces(places: Place[], query: string): Place[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return places.slice(0, 5)
  const terms = normalized.split(/\s+/).filter(Boolean)
  return places
    .map((place) => {
      const haystackWords = `${place.name} ${place.kind} ${place.blurb}`.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? []
      const name = place.name.toLocaleLowerCase()
      const nameWords = name.match(/[a-z0-9]+/g) ?? []
      const matches = terms.filter((term) => haystackWords.some((word) => word.startsWith(term))).length
      const nameMatches = terms.filter((term) => nameWords.some((word) => word.startsWith(term))).length
      const score = name === normalized ? 120 : name.startsWith(normalized) ? 100 : nameMatches === terms.length ? 80 : matches * 20
      return { place, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
    .map(({ place }) => place)
    .slice(0, 8)
}

function mergePlaces(first: Place[], second: Place[]): Place[] {
  const seen = new Set<string>()
  return [...first, ...second].filter((place) => {
    if (seen.has(place.id)) return false
    seen.add(place.id)
    return true
  })
}

function placeIcon(kind: string): string {
  if (kind === 'park') return '♧'
  if (kind === 'trail') return '⌁'
  if (kind === 'landmark' || kind === 'campus') return '⌂'
  if (kind === 'intersection') return '⌖'
  return '●'
}
