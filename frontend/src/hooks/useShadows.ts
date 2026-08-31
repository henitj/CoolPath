import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ShadowResponse } from '../types'

/** Fetch the building-shadow layer for a timestamp (debounced). */
export function useShadows(timestamp: string | undefined, delayMs = 350) {
  const [shadows, setShadows] = useState<ShadowResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const data = await api.shadows(timestamp)
        if (!cancelled) setShadows(data)
      } catch {
        if (!cancelled) setShadows(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, delayMs)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [timestamp, delayMs])

  return { shadows, loading }
}
