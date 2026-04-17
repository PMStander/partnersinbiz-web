import { detectDevice } from '@/lib/analytics/device'

describe('detectDevice', () => {
  it('returns mobile for iPhone UA', () => {
    expect(detectDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile')
  })

  it('returns mobile for Android phone UA', () => {
    expect(detectDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')).toBe('mobile')
  })

  it('returns tablet for iPad UA', () => {
    expect(detectDevice('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet')
  })

  it('returns desktop for Chrome on macOS', () => {
    expect(detectDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120')).toBe('desktop')
  })

  it('returns null for null input', () => {
    expect(detectDevice(null)).toBeNull()
  })
})
