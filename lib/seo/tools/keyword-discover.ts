// Keyword discovery: combines Google Autocomplete, Wikipedia related topics, and (later)
// GSC opportunities + competitor extraction. Returns ranked candidates.

export interface KeywordCandidate {
  keyword: string
  source: 'autocomplete' | 'wikipedia' | 'gsc' | 'seed-variation'
  intent: 'problem' | 'solution' | 'brand'
}

export async function discoverKeywords(seedKeywords: string[], _siteUrl?: string): Promise<KeywordCandidate[]> {
  const out: KeywordCandidate[] = []
  for (const seed of seedKeywords) {
    out.push(...(await fromAutocomplete(seed)))
    out.push(...(await fromWikipedia(seed)))
    out.push(...seedVariations(seed))
  }
  // De-dup by keyword
  const seen = new Set<string>()
  return out.filter((c) => {
    const k = c.keyword.toLowerCase().trim()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function fromAutocomplete(seed: string): Promise<KeywordCandidate[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) return []
    const arr = await res.json()
    const suggestions: string[] = arr[1] ?? []
    return suggestions.slice(0, 10).map((k) => ({
      keyword: k,
      source: 'autocomplete' as const,
      intent: inferIntent(k),
    }))
  } catch {
    return []
  }
}

async function fromWikipedia(seed: string): Promise<KeywordCandidate[]> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/related/${encodeURIComponent(seed)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = (json.pages ?? []) as any[]
    return pages.slice(0, 5).map((p) => ({
      keyword: p.title,
      source: 'wikipedia' as const,
      intent: inferIntent(p.title),
    }))
  } catch {
    return []
  }
}

function seedVariations(seed: string): KeywordCandidate[] {
  return [
    `${seed} alternative`,
    `${seed} vs`,
    `best ${seed}`,
    `how to ${seed}`,
    `${seed} for small business`,
    `${seed} pricing`,
  ].map((k) => ({ keyword: k, source: 'seed-variation' as const, intent: inferIntent(k) }))
}

function inferIntent(k: string): 'problem' | 'solution' | 'brand' {
  const lc = k.toLowerCase()
  if (lc.startsWith('how to') || lc.startsWith('what is') || lc.startsWith('why')) return 'problem'
  if (lc.includes(' vs ') || lc.includes('best ') || lc.includes('alternative')) return 'solution'
  return 'brand'
}
