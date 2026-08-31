import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { HazardFeature } from '../types'

/** Poll the crowdsourced hazard layer and expose a manual refresh. */
export function useHazards(intervalMs = 20_000) {
  const [hazards, setHazards] = useState<HazardFeature[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await api.hazards()
      setHazards(response.features)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    let active = true

    void api
      .hazards()
      .then((response) => {
        if (active) {
          setHazards(response.features)
          setError(null)
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })

    const timer = setInterval(() => void refresh(), intervalMs)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [refresh, intervalMs])

  return { hazards, error, refresh }
}
