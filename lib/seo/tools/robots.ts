export interface RobotsAudit {
  domain: string
  status: number
  raw: string
  rules: { agent: string; disallow: string[]; allow: string[] }[]
  sitemaps: string[]
  issues: string[]
}

export async function runRobotsCheck(domain: string): Promise<RobotsAudit> {
  const url = domain.startsWith('http') ? `${domain.replace(/\/$/, '')}/robots.txt` : `https://${domain}/robots.txt`
  const res = await fetch(url)
  const raw = await res.text()
  const rules: { agent: string; disallow: string[]; allow: string[] }[] = []
  const sitemaps: string[] = []
  const issues: string[] = []
  let current = { agent: '', disallow: [] as string[], allow: [] as string[] }
  for (const line of raw.split('\n').map((l) => l.trim())) {
    if (!line || line.startsWith('#')) continue
    const [keyRaw, ...restParts] = line.split(':')
    const key = keyRaw.toLowerCase().trim()
    const value = restParts.join(':').trim()
    if (key === 'user-agent') {
      if (current.agent) rules.push(current)
      current = { agent: value, disallow: [], allow: [] }
    } else if (key === 'disallow' && current.agent) {
      current.disallow.push(value)
    } else if (key === 'allow' && current.agent) {
      current.allow.push(value)
    } else if (key === 'sitemap') {
      sitemaps.push(value)
    }
  }
  if (current.agent) rules.push(current)
  for (const r of rules) {
    if (r.disallow.includes('/')) {
      if (r.agent === '*' || r.agent.toLowerCase().includes('googlebot')) {
        issues.push(`Disallow: / for User-agent: ${r.agent} — blocks crawl entirely`)
      }
    }
  }
  if (sitemaps.length === 0) issues.push('No sitemap declared in robots.txt')
  return { domain, status: res.status, raw, rules, sitemaps, issues }
}
