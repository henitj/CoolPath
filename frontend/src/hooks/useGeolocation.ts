import { useCallback, useRef, useState } from 'react'

export interface GeoState {
  /** Browser coordinates in the same [longitude, latitude] order as GeoJSON. */
  coords: [number, number] | null
  accuracy: number | null
  error: string | null
  loading: boolean
}

/**
 * Browser geolocation with a promise-based locator.
 *
 * Returning the actual result fixes the old stale-state polling pattern: a
 * route or hazard can now use the freshly granted position immediately rather
 * than waiting for a closure from a previous React render.
 */
export function useGeolocation(): GeoState & { locate: () => Promise<[number, number] | null> } {
  const [state, setState] = useState<GeoState>({ coords: null, accuracy: null, error: null, loading: false })
  const pendingRef = useRef<Promise<[number, number] | null> | null>(null)

  const locate = useCallback((): Promise<[number, number] | null> => {
    if (pendingRef.current) return pendingRef.current
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ coords: null, accuracy: null, error: 'Location is not available in this browser.', loading: false })
      return Promise.resolve(null)
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setState({
        coords: null,
        accuracy: null,
        error: 'Location needs a secure (HTTPS) connection.',
        loading: false,
      })
      return Promise.resolve(null)
    }

    setState((previous) => ({ ...previous, loading: true, error: null }))
    const request = new Promise<[number, number] | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: [number, number] = [position.coords.longitude, position.coords.latitude]
          setState({
            coords,
            accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
            error: null,
            loading: false,
          })
          resolve(coords)
        },
        (error) => {
          setState((previous) => ({
            ...previous,
            error: error.message || 'Location permission was not granted.',
            loading: false,
          }))
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 45_000 },
      )
    })

    pendingRef.current = request
    void request.finally(() => {
      pendingRef.current = null
    })
    return request
  }, [])

  return { ...state, locate }
}
