import { describe, expect, it } from 'vitest'
import { austinTodayAt } from './time'

describe('austinTodayAt', () => {
  it('returns a valid ISO instant whose Austin wall clock matches the request', () => {
    const iso = austinTodayAt(14, 30, new Date('2026-08-30T10:00:00Z'))
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(iso))
    const hour = Number(parts.find((p) => p.type === 'hour')!.value) % 24
    const minute = parts.find((p) => p.type === 'minute')!.value
    expect(hour).toBe(14)
    expect(minute).toBe('30')
  })

  it('handles DST offsets without drifting an hour', () => {
    const winter = austinTodayAt(12, 0, new Date('2026-01-15T00:00:00Z'))
    const summer = austinTodayAt(12, 0, new Date('2026-07-15T00:00:00Z'))
    const wall = (iso: string) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(iso))
    expect(Number(wall(winter)) % 24).toBe(12)
    expect(Number(wall(summer)) % 24).toBe(12)
  })
})
