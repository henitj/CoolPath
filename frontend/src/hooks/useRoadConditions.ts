import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RoadConditionsResponse } from '../types'

/** Keep the colour-coded road overlay fresh without making map rendering wait. */
export function useRoadConditions(intervalMs = 60_000) {
  const [conditions, setConditions] = useState<RoadConditionsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await api.roadConditions()
      setConditions(response)
      setUpdatedAt(new Date())
      setError(null)
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    }
  }, [])

  useEffect(() => {
    let current = true
    void api
      .roadConditions()
      .then((response) => {
        if (!current) return
        setConditions(response)
        setUpdatedAt(new Date())
        setError(null)
      })
      .catch((err) => {
        if (current) setError(err instanceof Error ? err.message : String(err))
      })
    const interval = window.setInterval(() => void refresh(), intervalMs)
    return () => {
      current = false
      window.clearInterval(interval)
    }
  }, [intervalMs, refresh])

  return { conditions, error, updatedAt, refresh }
}
