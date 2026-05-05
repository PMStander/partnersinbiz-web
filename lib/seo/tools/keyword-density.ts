import { fetchPage } from './page-fetch'

export interface KeywordDensityResult {
  url: string
  keyword: string
  totalWords: number
  occurrences: number
  density: number
  topTerms: { term: string; count: number }[]
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those',
  'it', 'its', 'as', 'you', 'your', 'we', 'our', 'they', 'their', 'i', 'my',
])

export async function runKeywordDensity(url: string, keyword: string): Promise<KeywordDensityResult> {
  const page = await fetchPage(url)
  const text = page.html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
  const tokens = text.split(/\s+/).filter((t) => t.length >= 3 && /^[a-z]/.test(t) && !STOP.has(t))
  const totalWords = tokens.length
  const counts = new Map<string, number>()
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
  const kwLower = keyword.toLowerCase()
  // Match phrase if multi-word
  const kwTokens = kwLower.split(/\s+/)
  let occurrences = 0
  if (kwTokens.length === 1) {
    occurrences = counts.get(kwLower) ?? 0
  } else {
    const joined = tokens.join(' ')
    const re = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    occurrences = (joined.match(re) ?? []).length
  }
  const density = totalWords > 0 ? occurrences / totalWords : 0
  const topTerms = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, count]) => ({ term, count }))
  return { url, keyword, totalWords, occurrences, density, topTerms }
}
