import { useCallback, useState } from 'react'
import { api, type RoutePayload } from '../api/client'
import type { RouteResponse } from '../types'

export function useRoute() {
  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRoute = useCallback(async (payload: RoutePayload) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.route(payload)
      setRoute(data)
      return data
    } catch (e) {
      setRoute(null)
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setRoute(null)
    setError(null)
  }, [])

  return { route, loading, error, fetchRoute, clear }
}
