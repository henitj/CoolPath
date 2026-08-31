/**
 * Tiny busy-counter context: any screen can mark work in flight; the header
 * logo spins and the tab bar breathes while the counter is > 0.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const Ctx = createContext<{ busy: boolean; start: () => void; stop: () => void }>({
  busy: false,
  start: () => {},
  stop: () => {},
})

export function useBusy() {
  return useContext(Ctx)
}

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0)
  const counter = useRef(0)

  const start = useCallback(() => {
    counter.current += 1
    setCount(counter.current)
  }, [])

  const stop = useCallback(() => {
    counter.current = Math.max(0, counter.current - 1)
    setCount(counter.current)
  }, [])

  const value = useMemo(() => ({ busy: count > 0, start, stop }), [count, start, stop])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
