import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { SatelliteStatus } from '../types'

/** Data-source status with a manual live-refresh trigger. */
export function useSatelliteStatus() {
  const [status, setStatus] = useState<SatelliteStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await api.satelliteStatus())
  }, [])

  const triggerRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await api.refreshSatellite()
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }, [refresh])

  useEffect(() => {
    let active = true
    void api
      .satelliteStatus()
      .then((data) => {
        if (active) setStatus(data)
      })
      .catch(() => {
        if (active) setStatus(null)
      })
    return () => {
      active = false
    }
  }, [])

  return { status, refreshing, refresh, triggerRefresh }
}
