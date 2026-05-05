import { adminDb } from '@/lib/firebase/admin'

const CACHE_TTL_MS = 5 * 60 * 1000

export interface FetchedPage {
  html: string
  status: number
  headers: Record<string, string>
  cachedAt: string
}

export async function fetchPage(url: string, opts?: { userAgent?: string }): Promise<FetchedPage> {
  const cacheKey = encodeURIComponent(url)
  const ref = adminDb.collection('seo_page_cache').doc(cacheKey)
  try {
    const snap = await ref.get()
    if (snap.exists) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = snap.data() as any
      if (c.cachedAt && Date.now() - new Date(c.cachedAt).getTime() < CACHE_TTL_MS) return c
    }
  } catch {
    // continue without cache
  }
  const ua = opts?.userAgent ?? 'PartnersInBiz-SEO-Bot/1.0'
  const res = await fetch(url, { headers: { 'User-Agent': ua } })
  const html = await res.text()
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    headers[k] = v
  })
  const data: FetchedPage = { html, status: res.status, headers, cachedAt: new Date().toISOString() }
  try {
    await ref.set(data)
  } catch {
    // continue
  }
  return data
}
