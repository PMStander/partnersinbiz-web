import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function PortalPagesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Aggregate per-page metrics from seo_keywords (where targetPageUrl is set)
  const snap = await adminDb
    .collection('seo_keywords')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byPage = new Map<string, any>()
  for (const d of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = d.data() as any
    if (!k.targetPageUrl) continue
    const cur = byPage.get(k.targetPageUrl) ?? {
      url: k.targetPageUrl,
      keywords: 0,
      impressions: 0,
      clicks: 0,
      bestPosition: 999,
      topQuery: '',
    }
    cur.keywords++
    cur.impressions += k.currentImpressions ?? 0
    cur.clicks += k.currentClicks ?? 0
    if (k.currentPosition && k.currentPosition < cur.bestPosition) {
      cur.bestPosition = k.currentPosition
      cur.topQuery = k.keyword
    }
    byPage.set(k.targetPageUrl, cur)
  }
  const pages = [...byPage.values()].sort((a, b) => b.impressions - a.impressions)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Pages ({pages.length})</h2>
      {pages.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          Per-page data appears here once Google Search Console data starts flowing.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-left bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2">URL</th>
                <th className="px-4 py-2">Top query</th>
                <th className="px-4 py-2">Best position</th>
                <th className="px-4 py-2">Impressions</th>
                <th className="px-4 py-2">Clicks</th>
                <th className="px-4 py-2">Keywords</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pages.map((p) => (
                <tr key={p.url}>
                  <td className="px-4 py-2 text-xs">
                    <a href={p.url} target="_blank" rel="noopener" className="underline">
                      {p.url.replace(/^https?:\/\//, '')}
                    </a>
                  </td>
                  <td className="px-4 py-2">{p.topQuery || '—'}</td>
                  <td className="px-4 py-2">{p.bestPosition < 999 ? p.bestPosition.toFixed(1) : '—'}</td>
                  <td className="px-4 py-2">{p.impressions}</td>
                  <td className="px-4 py-2">{p.clicks}</td>
                  <td className="px-4 py-2">{p.keywords}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
