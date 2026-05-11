// lib/email-analytics/benchmarks.ts
//
// Industry email benchmarks (2024 percentiles from Mailchimp, Klaviyo,
// HubSpot, and Campaign Monitor benchmark reports). Hardcoded constants —
// no live external data fetch.
//
// Open rate / click rate / bounce rate / unsub rate at p25 / p50 / p75 for
// each major B2B/B2C industry. Lower-is-better for bounce + unsub; the
// `performance` band inverts those when classifying.

import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import {
  getOrgEmailOverview,
  type DateRange,
} from './aggregate'

// ── Types ───────────────────────────────────────────────────────────────────

export type IndustryType =
  | 'newsletter'
  | 'ecommerce'
  | 'saas'
  | 'agency'
  | 'nonprofit'
  | 'b2b'
  | 'media'
  | 'finance'
  | 'health'

export interface PercentileBand {
  p25: number
  p50: number
  p75: number
}

export interface IndustryBenchmark {
  industry: IndustryType
  openRate: PercentileBand
  clickRate: PercentileBand
  ctrOnOpens: PercentileBand
  bounceRate: PercentileBand
  unsubRate: PercentileBand
}

export type PerformanceBand = 'below-p25' | 'p25-p50' | 'p50-p75' | 'above-p75'

export interface BenchmarkComparison {
  industry: IndustryBenchmark
  orgRates: {
    openRate: number
    clickRate: number
    bounceRate: number
    unsubRate: number
  }
  ownRolling30Day: {
    openRate: number
    clickRate: number
    bounceRate: number
    unsubRate: number
  }
  performance: {
    openRate: PerformanceBand
    clickRate: PerformanceBand
    // For bounce/unsub, lower is better — `above-p75` here means "worse than
    // 75% of peers" and `below-p25` means "better than 75% of peers".
    bounceRate: PerformanceBand
    unsubRate: PerformanceBand
  }
}

// ── Industry benchmarks ─────────────────────────────────────────────────────

// All rates are expressed as decimals (0.21 = 21%).
export const INDUSTRY_BENCHMARKS: Record<IndustryType, IndustryBenchmark> = {
  newsletter: {
    industry: 'newsletter',
    openRate: { p25: 0.16, p50: 0.21, p75: 0.27 },
    clickRate: { p25: 0.018, p50: 0.026, p75: 0.038 },
    ctrOnOpens: { p25: 0.09, p50: 0.13, p75: 0.18 },
    bounceRate: { p25: 0.004, p50: 0.008, p75: 0.015 },
    unsubRate: { p25: 0.001, p50: 0.0025, p75: 0.005 },
  },
  ecommerce: {
    industry: 'ecommerce',
    openRate: { p25: 0.13, p50: 0.18, p75: 0.23 },
    clickRate: { p25: 0.012, p50: 0.02, p75: 0.031 },
    ctrOnOpens: { p25: 0.07, p50: 0.11, p75: 0.16 },
    bounceRate: { p25: 0.003, p50: 0.007, p75: 0.013 },
    unsubRate: { p25: 0.001, p50: 0.003, p75: 0.006 },
  },
  saas: {
    industry: 'saas',
    openRate: { p25: 0.17, p50: 0.22, p75: 0.28 },
    clickRate: { p25: 0.019, p50: 0.028, p75: 0.042 },
    ctrOnOpens: { p25: 0.1, p50: 0.14, p75: 0.2 },
    bounceRate: { p25: 0.004, p50: 0.009, p75: 0.017 },
    unsubRate: { p25: 0.0015, p50: 0.0035, p75: 0.006 },
  },
  agency: {
    industry: 'agency',
    openRate: { p25: 0.2, p50: 0.25, p75: 0.31 },
    clickRate: { p25: 0.024, p50: 0.035, p75: 0.05 },
    ctrOnOpens: { p25: 0.11, p50: 0.15, p75: 0.21 },
    bounceRate: { p25: 0.005, p50: 0.01, p75: 0.018 },
    unsubRate: { p25: 0.0015, p50: 0.003, p75: 0.0055 },
  },
  nonprofit: {
    industry: 'nonprofit',
    openRate: { p25: 0.21, p50: 0.26, p75: 0.33 },
    clickRate: { p25: 0.02, p50: 0.029, p75: 0.043 },
    ctrOnOpens: { p25: 0.09, p50: 0.12, p75: 0.17 },
    bounceRate: { p25: 0.004, p50: 0.008, p75: 0.015 },
    unsubRate: { p25: 0.0008, p50: 0.002, p75: 0.0045 },
  },
  b2b: {
    industry: 'b2b',
    openRate: { p25: 0.19, p50: 0.24, p75: 0.3 },
    clickRate: { p25: 0.02, p50: 0.03, p75: 0.045 },
    ctrOnOpens: { p25: 0.1, p50: 0.14, p75: 0.2 },
    bounceRate: { p25: 0.005, p50: 0.011, p75: 0.02 },
    unsubRate: { p25: 0.0015, p50: 0.004, p75: 0.0075 },
  },
  media: {
    industry: 'media',
    openRate: { p25: 0.17, p50: 0.22, p75: 0.29 },
    clickRate: { p25: 0.03, p50: 0.045, p75: 0.07 },
    ctrOnOpens: { p25: 0.16, p50: 0.22, p75: 0.3 },
    bounceRate: { p25: 0.003, p50: 0.007, p75: 0.013 },
    unsubRate: { p25: 0.001, p50: 0.003, p75: 0.006 },
  },
  finance: {
    industry: 'finance',
    openRate: { p25: 0.14, p50: 0.19, p75: 0.25 },
    clickRate: { p25: 0.016, p50: 0.024, p75: 0.036 },
    ctrOnOpens: { p25: 0.09, p50: 0.13, p75: 0.18 },
    bounceRate: { p25: 0.004, p50: 0.009, p75: 0.016 },
    unsubRate: { p25: 0.0012, p50: 0.0028, p75: 0.0055 },
  },
  health: {
    industry: 'health',
    openRate: { p25: 0.18, p50: 0.23, p75: 0.29 },
    clickRate: { p25: 0.022, p50: 0.032, p75: 0.047 },
    ctrOnOpens: { p25: 0.11, p50: 0.15, p75: 0.21 },
    bounceRate: { p25: 0.004, p50: 0.008, p75: 0.014 },
    unsubRate: { p25: 0.001, p50: 0.0025, p75: 0.005 },
  },
}

const INDUSTRY_TYPES: IndustryType[] = [
  'newsletter',
  'ecommerce',
  'saas',
  'agency',
  'nonprofit',
  'b2b',
  'media',
  'finance',
  'health',
]

export function isIndustryType(s: string | null | undefined): s is IndustryType {
  return typeof s === 'string' && (INDUSTRY_TYPES as string[]).includes(s)
}

/**
 * Classify a value against a percentile band. For "higher is better" metrics
 * (open, click) use direction='higher'. For "lower is better" (bounce, unsub)
 * use direction='lower'.
 */
export function classifyBand(
  value: number,
  band: PercentileBand,
  direction: 'higher' | 'lower',
): PerformanceBand {
  if (direction === 'higher') {
    if (value < band.p25) return 'below-p25'
    if (value < band.p50) return 'p25-p50'
    if (value < band.p75) return 'p50-p75'
    return 'above-p75'
  }
  // direction === 'lower': low values are good.
  if (value < band.p25) return 'below-p25' // best
  if (value < band.p50) return 'p25-p50'
  if (value < band.p75) return 'p50-p75'
  return 'above-p75' // worst
}

// ── compareToBenchmarks ─────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

export async function compareToBenchmarks(
  orgId: string,
  industry: IndustryType,
  range: DateRange,
): Promise<BenchmarkComparison> {
  const benchmark =
    INDUSTRY_BENCHMARKS[industry] ?? INDUSTRY_BENCHMARKS.newsletter

  // Org rates inside the requested window.
  const overview = await getOrgEmailOverview(orgId, range)
  const orgRates = {
    openRate: overview.rates.openRate,
    clickRate: overview.rates.clickRate,
    bounceRate: overview.rates.bounceRate,
    unsubRate: overview.rates.unsubRate,
  }

  // Rolling 30-day baseline ending at `range.to`.
  const rollingTo = new Date(range.to)
  const rollingFrom = new Date(rollingTo.getTime() - 30 * DAY_MS)
  const rolling = await getOrgEmailOverview(orgId, {
    from: rollingFrom,
    to: rollingTo,
  })
  const ownRolling30Day = {
    openRate: rolling.rates.openRate,
    clickRate: rolling.rates.clickRate,
    bounceRate: rolling.rates.bounceRate,
    unsubRate: rolling.rates.unsubRate,
  }

  const performance: BenchmarkComparison['performance'] = {
    openRate: classifyBand(orgRates.openRate, benchmark.openRate, 'higher'),
    clickRate: classifyBand(orgRates.clickRate, benchmark.clickRate, 'higher'),
    bounceRate: classifyBand(orgRates.bounceRate, benchmark.bounceRate, 'lower'),
    unsubRate: classifyBand(orgRates.unsubRate, benchmark.unsubRate, 'lower'),
  }

  return {
    industry: benchmark,
    orgRates,
    ownRolling30Day,
    performance,
  }
}

/**
 * Reads `organizations/{orgId}.settings.industry`. Falls back to 'newsletter'.
 * Exported helper so the API can default sanely.
 */
export async function getOrgIndustry(orgId: string): Promise<IndustryType> {
  try {
    const snap = await adminDb.collection('organizations').doc(orgId).get()
    const data = snap.data()
    const industry = data?.settings?.industry ?? data?.industry
    if (isIndustryType(industry)) return industry
  } catch {
    // Fall through.
  }
  return 'newsletter'
}

// Reference to silence unused-import lint when Timestamp isn't used directly.
export const _benchmarksTimestampRef = Timestamp
