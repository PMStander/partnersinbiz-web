export interface SitemapAudit {
  url: string
  status: number
  totalUrls: number
  urls: string[]
  spotChecked: { url: string; status: number }[]
  issues: string[]
}

export async function runSitemapCheck(sitemapUrl: string): Promise<SitemapAudit> {
  const res = await fetch(sitemapUrl)
  const xml = await res.text()
  const urlMatches = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1].trim())
  const issues: string[] = []
  if (urlMatches.length === 0) issues.push('No <loc> entries found')
  if (res.status >= 400) issues.push(`Sitemap returned status ${res.status}`)

  // Spot-check 5 random
  const sample = [...urlMatches]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5)
  const spot: { url: string; status: number }[] = []
  for (const u of sample) {
    try {
      const r = await fetch(u, { method: 'HEAD' })
      spot.push({ url: u, status: r.status })
      if (r.status >= 400) issues.push(`${u} returns ${r.status}`)
    } catch {
      spot.push({ url: u, status: 0 })
      issues.push(`${u} failed to fetch`)
    }
  }
  return { url: sitemapUrl, status: res.status, totalUrls: urlMatches.length, urls: urlMatches, spotChecked: spot, issues }
}
