import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { HazardFeature } from '../types'

/** Poll the crowdsourced hazard layer; exposes manual refresh + create. */
export function useHazards(intervalMs = 20000) {
  const [hazards, setHazards] = useState<HazardFeature[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const fc = await api.hazards()
      setHazards(fc.features)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    timer.current = setInterval(() => void refresh(), intervalMs)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [refresh, intervalMs])

  return { hazards, error, refresh }
}
