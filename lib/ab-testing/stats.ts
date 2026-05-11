// lib/ab-testing/stats.ts
//
// Statistical significance for A/B winner selection.
//
// We use a two-proportion z-test on the variant rate for the chosen metric:
//
//   p_i  = numerator_i / denominator_i   (e.g. opens / sent)
//   z    = (p1 - p2) / sqrt(p̂ (1 - p̂) (1/n1 + 1/n2))     where p̂ is the pooled rate
//   p-value = 2 * (1 - Φ(|z|))                              (two-tailed)
//
// A variant is declared a winner when:
//   • every variant has ≥ minSamplesPerVariant DENOMINATOR observations
//   • the highest-rate variant has a p-value < (1 - confidenceThreshold) when
//     compared pairwise against the SECOND-best variant (3+ variants) or against
//     the only other variant (2-variant case)
//
// We deliberately avoid Welch's t-test or Bayesian priors here — the platform
// already buckets impressions into binary success/failure outcomes (opened? yes/no;
// clicked? yes/no), so a two-proportion z-test is the textbook correct fit. The
// approximation breaks down with extremely small N — that's why the
// `insufficient-data` short-circuit exists.

import type { AbWinnerMetric, Variant } from './types'

export interface SignificanceResult {
  winner: Variant | null
  confidence: number // 0..1
  pValue?: number
  effectSize: number // absolute difference in rates between best and second-best
  reason: 'significant' | 'insufficient-data' | 'tie' | 'no-data'
}

export interface SignificanceOptions {
  minSamplesPerVariant: number
  confidenceThreshold: number // e.g. 0.95
}

export const DEFAULT_SIGNIFICANCE_OPTIONS: SignificanceOptions = {
  minSamplesPerVariant: 100,
  confidenceThreshold: 0.95,
}

/**
 * Numerator / denominator for the chosen metric.
 *
 *   opens, open-rate           → opened   / sent
 *   clicks, click-through-rate → clicked  / opened
 *
 * For "opens" / "clicks" the test still uses the same rate — the metric only
 * decides which variant has the highest *count*, but significance must be
 * computed on the underlying RATE so two variants with vastly different sample
 * sizes are comparable.
 */
function metricCounts(v: Variant, metric: AbWinnerMetric): { num: number; den: number } {
  switch (metric) {
    case 'opens':
    case 'open-rate':
      return { num: v.opened, den: v.sent }
    case 'clicks':
    case 'click-through-rate':
      return { num: v.clicked, den: v.opened }
  }
}

function rate(v: Variant, metric: AbWinnerMetric): number {
  const { num, den } = metricCounts(v, metric)
  return den > 0 ? num / den : 0
}

/**
 * Abramowitz & Stegun 26.2.17 approximation of the standard normal CDF.
 * Max error ≈ 7.5e-8 over the real line — easily good enough for p-values.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2

  // erf approximation
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return 0.5 * (1 + sign * y)
}

/**
 * Two-proportion (pooled) z-test. Returns the absolute z and the two-tailed
 * p-value. Handles the degenerate cases (both denominators positive, both
 * proportions in [0,1]) defensively.
 */
function twoProportionZTest(
  num1: number,
  den1: number,
  num2: number,
  den2: number,
): { z: number; pValue: number } {
  if (den1 <= 0 || den2 <= 0) {
    return { z: 0, pValue: 1 }
  }
  const p1 = num1 / den1
  const p2 = num2 / den2
  const pooled = (num1 + num2) / (den1 + den2)
  const denom = Math.sqrt(pooled * (1 - pooled) * (1 / den1 + 1 / den2))
  if (denom === 0) {
    // Both rates 0 or both 1 — by construction equal.
    return { z: 0, pValue: 1 }
  }
  const z = (p1 - p2) / denom
  const pValue = 2 * (1 - normalCdf(Math.abs(z)))
  return { z, pValue }
}

export function calculateSignificance(
  variants: Variant[],
  metric: AbWinnerMetric,
  opts?: Partial<SignificanceOptions>,
): SignificanceResult {
  const o: SignificanceOptions = {
    ...DEFAULT_SIGNIFICANCE_OPTIONS,
    ...(opts ?? {}),
  }

  if (!variants || variants.length === 0) {
    return { winner: null, confidence: 0, effectSize: 0, reason: 'no-data' }
  }
  if (variants.length < 2) {
    return { winner: null, confidence: 0, effectSize: 0, reason: 'insufficient-data' }
  }

  // We test on the metric's DENOMINATOR. For opens/open-rate that's `sent`;
  // for clicks/CTR that's `opened`.
  const insufficient = variants.some((v) => metricCounts(v, metric).den < o.minSamplesPerVariant)
  if (insufficient) {
    return { winner: null, confidence: 0, effectSize: 0, reason: 'insufficient-data' }
  }

  // Rank by rate, descending. Stable on the original index for tie-breaking.
  const ranked = variants
    .map((v, idx) => ({ v, idx, rate: rate(v, metric), counts: metricCounts(v, metric) }))
    .sort((a, b) => {
      if (b.rate !== a.rate) return b.rate - a.rate
      return a.idx - b.idx
    })

  const best = ranked[0]
  const second = ranked[1]

  // Effect size = absolute difference in rate between best and second-best.
  const effectSize = Math.abs(best.rate - second.rate)

  // If literally every variant has the same rate, it's a tie.
  if (effectSize === 0) {
    return { winner: null, confidence: 0, pValue: 1, effectSize: 0, reason: 'tie' }
  }

  // Pairwise: best vs second-best. If best is significantly better than the
  // closest competitor, it's also significantly better than the rest.
  const { pValue } = twoProportionZTest(
    best.counts.num,
    best.counts.den,
    second.counts.num,
    second.counts.den,
  )
  const confidence = 1 - pValue

  if (pValue < 1 - o.confidenceThreshold) {
    return {
      winner: best.v,
      confidence,
      pValue,
      effectSize,
      reason: 'significant',
    }
  }

  return {
    winner: null,
    confidence,
    pValue,
    effectSize,
    reason: 'tie',
  }
}

/**
 * Pairwise comparison table: rate, lift vs leader, p-value, confidence.
 * Used by the admin UI to show "Variant A beats Variant B by X% with Y% confidence".
 */
export interface PairwiseComparison {
  bestVariantId: string
  challengerVariantId: string
  bestRate: number
  challengerRate: number
  liftAbsolute: number // bestRate - challengerRate
  liftRelative: number // (bestRate - challengerRate) / challengerRate (∞ when challenger 0)
  pValue: number
  confidence: number
}

export function pairwiseComparisons(
  variants: Variant[],
  metric: AbWinnerMetric,
): PairwiseComparison[] {
  if (!variants || variants.length < 2) return []
  const ranked = variants
    .map((v) => ({ v, rate: rate(v, metric), counts: metricCounts(v, metric) }))
    .sort((a, b) => b.rate - a.rate)
  const best = ranked[0]
  const out: PairwiseComparison[] = []
  for (let i = 1; i < ranked.length; i++) {
    const c = ranked[i]
    const { pValue } = twoProportionZTest(
      best.counts.num,
      best.counts.den,
      c.counts.num,
      c.counts.den,
    )
    const liftAbsolute = best.rate - c.rate
    const liftRelative = c.rate > 0 ? liftAbsolute / c.rate : liftAbsolute > 0 ? Infinity : 0
    out.push({
      bestVariantId: best.v.id,
      challengerVariantId: c.v.id,
      bestRate: best.rate,
      challengerRate: c.rate,
      liftAbsolute,
      liftRelative,
      pValue,
      confidence: 1 - pValue,
    })
  }
  return out
}
