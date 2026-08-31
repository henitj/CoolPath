/** Time helpers for Austin (America/Chicago) shadow timestamps. */

function tzOffsetSeconds(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, number> = {}
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  )
  return Math.round((asUTC - instant.getTime()) / 1000)
}

/**
 * ISO timestamp for "today at `hour` o'clock in Austin" regardless of the
 * browser's timezone.  Used by the time-of-day shadow slider.
 */
export function austinTodayAt(hour: number, minute = 0, now: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, d] = dtf.format(now).split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour, minute)
  const offset = tzOffsetSeconds(new Date(guess), 'America/Chicago')
  return new Date(guess - offset * 1000).toISOString()
}
