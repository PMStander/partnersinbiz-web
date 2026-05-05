const BASE = 'https://ssl.bing.com/webmaster/api.svc/json'

export interface InboundLink {
  url: string
  sourceUrl: string
  anchorText: string
}

export async function fetchInboundLinks(siteUrl: string, page = 0): Promise<InboundLink[]> {
  const apikey = process.env.BING_WMT_API_KEY
  if (!apikey) throw new Error('BING_WMT_API_KEY not set')
  const url = `${BASE}/GetLinkCounts?siteUrl=${encodeURIComponent(siteUrl)}&page=${page}&apikey=${apikey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bing WMT error ${res.status}`)
  const json = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json.d ?? []).map((row: any) => ({
    url: row.Url,
    sourceUrl: row.SourceUrl,
    anchorText: row.AnchorText ?? '',
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchQueryStats(siteUrl: string): Promise<any[]> {
  const apikey = process.env.BING_WMT_API_KEY
  if (!apikey) throw new Error('BING_WMT_API_KEY not set')
  const url = `${BASE}/GetQueryStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${apikey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bing WMT error ${res.status}`)
  const json = await res.json()
  return json.d ?? []
}
