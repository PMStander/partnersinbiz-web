import { fetchPage } from './page-fetch'

export interface CanonicalAudit {
  url: string
  status: number
  canonical: string | null
  matches: boolean
  issues: string[]
}

export async function runCanonicalCheck(url: string): Promise<CanonicalAudit> {
  const page = await fetchPage(url)
  const m = page.html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)
  const canonical = m ? m[1].trim() : null
  const issues: string[] = []
  if (!canonical) issues.push('No canonical tag')
  // Compare normalised
  const norm = (s: string) => s.replace(/\/$/, '').toLowerCase()
  const matches = !!canonical && norm(canonical) === norm(url)
  if (canonical && !matches) issues.push(`Canonical points elsewhere: ${canonical}`)
  return { url, status: page.status, canonical, matches, issues }
}
