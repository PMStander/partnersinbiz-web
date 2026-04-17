import type { DeviceType } from './types'

export function detectDevice(ua: string | null): DeviceType | null {
  if (!ua) return null
  if (/iPad/i.test(ua)) return 'tablet'
  if (/mobile|android|iphone/i.test(ua)) return 'mobile'
  return 'desktop'
}
