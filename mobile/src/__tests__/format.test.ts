import { describe, expect, it } from 'vitest'
import { apiUrlFromHostUri, apiUrlFromPreviewHost, normalizeBaseUrl } from '../url'
import { deltaSummary, formatAgo, formatClock, formatDistance, formatMinutes, formatTemp, formatTempUnit, haversineM } from '../format'

describe('normalizeBaseUrl', () => {
  it('adds scheme, strips trailing slashes and /api/v1', () => {
    expect(normalizeBaseUrl(' 192.168.1.5:8000 ')).toBe('http://192.168.1.5:8000')
    expect(normalizeBaseUrl('http://foo:8000/')).toBe('http://foo:8000')
    expect(normalizeBaseUrl('https://x.dev/api/v1//')).toBe('https://x.dev')
    expect(normalizeBaseUrl('', 'http://fallback:8000')).toBe('http://fallback:8000')
  })
})

describe('apiUrlFromHostUri (the QR magic)', () => {
  it('derives the API host from the Expo dev-server host', () => {
    expect(apiUrlFromHostUri('192.168.1.20:8081')).toBe('http://192.168.1.20:8000')
    expect(apiUrlFromHostUri('10.0.0.7:19000')).toBe('http://10.0.0.7:8000')
    expect(apiUrlFromHostUri('exp://192.168.1.20:8081')).toBe('http://192.168.1.20:8000')
    // Expo can advertise a mDNS hostname instead of an IPv4 address.
    expect(apiUrlFromHostUri('MacBook-Pro.local:8081')).toBe('http://MacBook-Pro.local:8000')
  })
  it('ignores loopback and junk', () => {
    expect(apiUrlFromHostUri('localhost:8081')).toBeNull()
    expect(apiUrlFromHostUri('127.0.0.1:8081')).toBeNull()
    expect(apiUrlFromHostUri('0.0.0.0:8081')).toBeNull()
    expect(apiUrlFromHostUri(undefined)).toBeNull()
    expect(apiUrlFromHostUri('')).toBeNull()
  })
})

describe('apiUrlFromPreviewHost (sandbox preview)', () => {
  it('maps the port-prefixed preview host to the API host', () => {
    expect(apiUrlFromPreviewHost('8081-inkmu0ovvd0uirel5xuv1.e2b.app')).toBe(
      'https://8000-inkmu0ovvd0uirel5xuv1.e2b.app',
    )
    expect(apiUrlFromPreviewHost('example.com')).toBeNull()
    expect(apiUrlFromPreviewHost(undefined)).toBeNull()
  })
})

describe('formatting', () => {
  it('temps in C and F', () => {
    expect(formatTemp(38.4, 'C')).toBe('38°')
    expect(formatTemp(38.4, 'F')).toBe('101°')
    expect(formatTempUnit(0, 'F')).toBe('32°F')
  })
  it('distances', () => {
    expect(formatDistance(850)).toBe('850 m')
    expect(formatDistance(1520)).toBe('1.5 km')
  })
  it('minutes', () => {
    expect(formatMinutes(45.2)).toBe('45 min')
    expect(formatMinutes(75)).toBe('1 h 15')
  })
  it('clock and ago', () => {
    expect(formatClock('not-a-date')).toBe('')
    expect(formatAgo(0.2)).toBe('just now')
    expect(formatAgo(5)).toBe('5 h ago')
    expect(formatAgo(50)).toBe('2 d ago')
  })
  it('delta summary stays calm and honest', () => {
    expect(deltaSummary(-1.2, 12)).toBe('1.2° cooler · 12% more shade')
    expect(deltaSummary(0.1, 0.4)).toBeNull()
    expect(deltaSummary(2, -5)).toBe('2.0° warmer · 5% less shade')
  })
  it('haversine sanity', () => {
    const d = haversineM(30.2672, -97.7431, 30.2683, -97.7431)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(140)
  })
})
