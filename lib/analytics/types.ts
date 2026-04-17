// lib/analytics/types.ts

export type DeviceType = 'mobile' | 'tablet' | 'desktop'
export type FunnelWindow = 'session' | '1h' | '24h' | '7d' | '30d'

export const VALID_FUNNEL_WINDOWS: FunnelWindow[] = ['session', '1h', '24h', '7d', '30d']

export const WINDOW_MS: Record<Exclude<FunnelWindow, 'session'>, number> = {
  '1h':  1 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export interface AnalyticsEvent {
  id: string
  orgId: string
  propertyId: string
  sessionId: string
  distinctId: string
  userId: string | null
  event: string
  properties: Record<string, unknown>
  pageUrl: string | null
  referrer: string | null
  userAgent: string | null
  ipHash: string | null
  country: string | null
  device: DeviceType | null
  timestamp: unknown  // Firestore Timestamp — serialised as { _seconds, _nanoseconds }
  serverTime: unknown
}

export interface AnalyticsSession {
  id: string
  orgId: string
  propertyId: string
  distinctId: string
  userId: string | null
  startedAt: unknown
  lastActivityAt: unknown
  endedAt: unknown | null
  eventCount: number
  pageCount: number
  referrer: string | null
  landingUrl: string | null
  country: string | null
  device: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  convertedEvents: string[]
}

export interface FunnelStep {
  event: string
  filters?: Record<string, unknown>
}

export interface AnalyticsFunnel {
  id: string
  orgId: string
  propertyId: string
  name: string
  steps: FunnelStep[]
  window: FunnelWindow
  createdBy: string
  createdAt: unknown
  updatedAt: unknown
}

export interface FunnelStepResult {
  event: string
  count: number
  conversionFromPrev: number | null
}

export interface FunnelResults {
  steps: FunnelStepResult[]
  totalEntered: number
  totalConverted: number
}

export interface IngestEventInput {
  event: string
  distinctId: string
  sessionId: string
  userId?: string | null
  properties?: Record<string, unknown>
  timestamp?: string
  pageUrl?: string | null
  referrer?: string | null
  userAgent?: string | null
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
  }
}

export interface IngestBody {
  propertyId: string
  events: IngestEventInput[]
}

export interface IngestResult {
  accepted: number
  rejected: number
  errors: string[]
}
