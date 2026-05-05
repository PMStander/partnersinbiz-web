const BASE = 'https://openpagerank.com/api/v1.0/getPageRank'

export async function getPageRank(domains: string[]): Promise<Record<string, number>> {
  const key = process.env.OPR_API_KEY
  if (!key) throw new Error('OPR_API_KEY not set')
  const params = domains.map((d) => `domains[]=${encodeURIComponent(d)}`).join('&')
  const res = await fetch(`${BASE}?${params}`, { headers: { 'API-OPR': key } })
  if (!res.ok) throw new Error(`OPR error ${res.status}`)
  const json = await res.json()
  const out: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (json.response ?? []) as any[]) {
    if (r.status_code === 200) out[r.domain] = parseFloat(r.page_rank_decimal ?? '0') * 10
  }
  return out
}
