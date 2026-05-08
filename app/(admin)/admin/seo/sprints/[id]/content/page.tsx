import { adminDb } from '@/lib/firebase/admin'
import { ContentRow } from './ContentRow'

export const dynamic = 'force-dynamic'

export default async function ContentTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb
    .collection('seo_content')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

  // Resolve keyword strings for any rows with targetKeywordId
  const kwIds = Array.from(new Set(items.map((i) => i.targetKeywordId).filter(Boolean) as string[]))
  const kwMap: Record<string, string> = {}
  if (kwIds.length) {
    const kwDocs = await Promise.all(
      kwIds.map((kid) => adminDb.collection('seo_keywords').doc(kid).get()),
    )
    for (const k of kwDocs) {
      if (k.exists) kwMap[k.id] = (k.data() as { keyword?: string } | undefined)?.keyword ?? ''
    }
  }

  // Prefetch draft bodies for rows that have a draftPostId. Done server-side so the
  // client doesn't need a per-org-scoped API call (the cockpit can be operated by an
  // admin viewing a different workspace context).
  const draftIds = Array.from(new Set(items.map((i) => i.draftPostId).filter(Boolean) as string[]))
  const draftMap: Record<string, { body?: string; metaDescription?: string; wordCount?: number; generatedBy?: string }> = {}
  if (draftIds.length) {
    const draftDocs = await Promise.all(
      draftIds.map((did) => adminDb.collection('seo_drafts').doc(did).get()),
    )
    for (const d of draftDocs) {
      if (d.exists) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = d.data() as any
        draftMap[d.id] = {
          body: data.body,
          metaDescription: data.metaDescription,
          wordCount: data.wordCount,
          generatedBy: data.generatedBy,
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Content ({items.length})</h2>
      {items.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          No content yet. Add via <code>POST /api/v1/seo/sprints/{id}/content</code>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-left border-b border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)] text-[var(--color-pib-text-muted)] uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 w-8"></th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Keyword</th>
                <th className="px-4 py-2">Phase</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Publish date</th>
                <th className="px-4 py-2">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((c) => (
                <ContentRow
                  key={c.id}
                  id={c.id}
                  title={c.title}
                  keyword={c.targetKeywordId ? kwMap[c.targetKeywordId] ?? '—' : '—'}
                  phase={c.phase ?? null}
                  type={c.type}
                  status={c.status}
                  publishDate={c.publishDate}
                  targetUrl={c.targetUrl}
                  draftPostId={c.draftPostId}
                  draft={c.draftPostId ? draftMap[c.draftPostId] : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
