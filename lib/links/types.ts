import type { Timestamp } from 'firebase-admin/firestore'

export interface ShortenedLink {
  id: string
  orgId: string
  propertyId?: string
  originalUrl: string
  shortCode: string // 6-8 char alphanumeric
  shortUrl: string // {APP_URL}/l/{shortCode}
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  clickCount: number
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface LinkClick {
  id: string
  linkId: string
  orgId: string
  timestamp: Timestamp
  referrer: string | null
  userAgent: string | null
  ip: string | null
  country: string | null
}

export interface LinkStats {
  totalClicks: number
  clicksByDay: Array<{ date: string; count: number }>
  topReferrers: Array<{ referrer: string; count: number }>
  topCountries: Array<{ country: string; count: number }>
  recentClicks: Array<{
    timestamp: Timestamp
    referrer: string | null
    country: string | null
  }>
}
