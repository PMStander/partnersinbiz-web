import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function PortalBlogTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb
    .collection('seo_content')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  const live = all.filter((c) => c.status === 'live')

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Blog ({live.length} live)</h2>
      {live.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          Published posts will appear here once content goes live.
        </div>
      ) : (
        <div className="space-y-3">
          {live.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">
                    {c.publishDate ? new Date(c.publishDate).toLocaleDateString() : 'Date TBD'} · {c.type}
                  </p>
                </div>
                <div className="text-xs text-right">
                  <div>{c.performance?.impressions ?? 0} impr</div>
                  <div>{c.performance?.clicks ?? 0} clicks</div>
                </div>
              </div>
              <div className="text-xs mt-2 flex gap-3">
                {c.targetUrl && (
                  <a href={c.targetUrl} target="_blank" rel="noopener" className="underline">
                    View post
                  </a>
                )}
                {c.liUrl && <span className="text-[var(--color-pib-text-muted)]">✓ LinkedIn</span>}
                {c.xUrl && <span className="text-[var(--color-pib-text-muted)]">✓ X</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
