import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ShadowResponse } from '../types'

/** Fetch the building-shadow layer for a timestamp, debounced. */
export function useShadows(timestamp: string | undefined, delayMs = 350) {
  const [shadows, setShadows] = useState<ShadowResponse | null>(null)

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      void api
        .shadows(timestamp)
        .then((data) => {
          if (active) setShadows(data)
        })
        .catch(() => {
          if (active) setShadows(null)
        })
    }, delayMs)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [timestamp, delayMs])

  return { shadows }
}
