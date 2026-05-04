import { fetchPage } from './page-fetch'

export interface InternalLinkAuditResult {
  sitemapUrl: string
  totalPages: number
  totalLinks: number
  orphans: string[]
  topLinkedPages: { url: string; inbound: number }[]
}

export async function runInternalLinkAudit(sitemapUrl: string): Promise<InternalLinkAuditResult> {
  const sitemapRes = await fetch(sitemapUrl)
  const xml = await sitemapRes.text()
  const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1].trim()).slice(0, 100)
  const inbound = new Map<string, number>()
  for (const u of urls) inbound.set(u, 0)
  let totalLinks = 0
  let baseHost = ''
  try {
    baseHost = new URL(urls[0]).hostname
  } catch {
    // skip
  }
  for (const url of urls) {
    try {
      const page = await fetchPage(url)
      const links = [...page.html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1])
      for (const href of links) {
        let abs = href
        try {
          abs = new URL(href, url).toString().split('#')[0]
        } catch {
          continue
        }
        if (!abs.includes(baseHost)) continue
        if (inbound.has(abs)) {
          inbound.set(abs, (inbound.get(abs) ?? 0) + 1)
          totalLinks++
        }
      }
    } catch {
      // continue
    }
  }
  const orphans = [...inbound.entries()].filter(([, c]) => c === 0).map(([u]) => u)
  const topLinkedPages = [...inbound.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([url, count]) => ({ url, inbound: count }))
  return { sitemapUrl, totalPages: urls.length, totalLinks, orphans, topLinkedPages }
}
