export interface SeoRoiInput {
  keywords: { keyword: string; volume: number; estimatedPosition?: number }[]
  conversionRate: number // 0-1
  avgValue: number // ZAR
}

export interface SeoRoiResult {
  monthlyImpressions: number
  monthlyClicks: number
  monthlyConversions: number
  monthlyValue: number
  perKeyword: { keyword: string; impressions: number; clicks: number; value: number }[]
}

const CTR_BY_POSITION = [0.32, 0.18, 0.12, 0.08, 0.06, 0.04, 0.03, 0.025, 0.02, 0.015]

export function calculateSeoRoi(input: SeoRoiInput): SeoRoiResult {
  let totalImpr = 0
  let totalClicks = 0
  const perKeyword: SeoRoiResult['perKeyword'] = []
  for (const k of input.keywords) {
    const pos = k.estimatedPosition ?? 5
    const ctr = pos <= 10 ? CTR_BY_POSITION[Math.max(0, Math.floor(pos) - 1)] ?? 0.01 : 0.005
    const impr = k.volume
    const clicks = Math.round(impr * ctr)
    const conv = clicks * input.conversionRate
    const value = conv * input.avgValue
    totalImpr += impr
    totalClicks += clicks
    perKeyword.push({ keyword: k.keyword, impressions: impr, clicks, value })
  }
  const monthlyConversions = totalClicks * input.conversionRate
  const monthlyValue = monthlyConversions * input.avgValue
  return {
    monthlyImpressions: totalImpr,
    monthlyClicks: totalClicks,
    monthlyConversions,
    monthlyValue,
    perKeyword,
  }
}
