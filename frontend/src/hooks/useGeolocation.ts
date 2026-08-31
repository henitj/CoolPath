import { useCallback, useState } from 'react'

export interface GeoState {
  coords: [number, number] | null
  error: string | null
  loading: boolean
}

/** Browser geolocation as [lon, lat]. */
export function useGeolocation(): GeoState & { locate: () => void } {
  const [state, setState] = useState<GeoState>({ coords: null, error: null, loading: false })

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ coords: null, error: 'Geolocation not available in this browser', loading: false })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          coords: [pos.coords.longitude, pos.coords.latitude],
          error: null,
          loading: false,
        }),
      (err) =>
        setState({ coords: null, error: err.message || 'Location permission denied', loading: false }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  }, [])

  return { ...state, locate }
}
