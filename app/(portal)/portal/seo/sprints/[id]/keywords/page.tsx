import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, string> = {
  top_3: 'bg-green-100 text-green-800',
  top_10: 'bg-blue-100 text-blue-800',
  ranking: 'bg-amber-100 text-amber-800',
  not_yet: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-purple-100 text-purple-800',
  lost: 'bg-red-100 text-red-800',
}

export default async function PortalKeywordsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb
    .collection('seo_keywords')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keywords = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  keywords.sort((a, b) => (a.currentPosition ?? 999) - (b.currentPosition ?? 999))

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Keywords ({keywords.length})</h2>
      {keywords.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          Keyword tracking starts after week 2.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-left bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2">Keyword</th>
                <th className="px-4 py-2">Position</th>
                <th className="px-4 py-2">Impressions</th>
                <th className="px-4 py-2">Clicks</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keywords.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2 font-medium">{k.keyword}</td>
                  <td className="px-4 py-2">{k.currentPosition ? k.currentPosition.toFixed(1) : '—'}</td>
                  <td className="px-4 py-2">{k.currentImpressions ?? 0}</td>
                  <td className="px-4 py-2">{k.currentClicks ?? 0}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_PILL[k.status] ?? ''}`}>{k.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
