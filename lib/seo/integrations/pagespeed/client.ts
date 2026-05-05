const BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export interface PageSpeedResult {
  url: string
  performance: number
  seo: number
  accessibility: number
  bestPractices: number
  lcp?: number
  cls?: number
  inp?: number
}

export async function runPageSpeed(url: string, strategy: 'mobile' | 'desktop' = 'mobile'): Promise<PageSpeedResult> {
  const key = process.env.PAGESPEED_API_KEY
  const params = new URLSearchParams({ url, strategy })
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) params.append('category', c)
  if (key) params.set('key', key)
  const res = await fetch(`${BASE}?${params.toString()}`)
  if (!res.ok) throw new Error(`PageSpeed error ${res.status}`)
  const json = await res.json()
  const cats = json.lighthouseResult?.categories ?? {}
  const audits = json.lighthouseResult?.audits ?? {}
  return {
    url,
    performance: Math.round((cats.performance?.score ?? 0) * 100),
    seo: Math.round((cats.seo?.score ?? 0) * 100),
    accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
    lcp: audits['largest-contentful-paint']?.numericValue,
    cls: audits['cumulative-layout-shift']?.numericValue,
    inp: audits['interactive']?.numericValue,
  }
}
