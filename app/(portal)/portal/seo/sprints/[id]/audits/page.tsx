import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function PortalAuditsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb
    .collection('seo_audits')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audits = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  audits.sort((a, b) => (a.snapshotDay ?? 0) - (b.snapshotDay ?? 0))

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Audits ({audits.length})</h2>
      {audits.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          Day 1 / 30 / 60 / 90 audit reports will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {audits.map((a) => (
            <div key={a.id} className="card p-5 space-y-2">
              <div className="text-xs text-[var(--color-pib-text-muted)]">
                {a.snapshotDay === 1 ? 'Day 1 baseline' : `Day ${a.snapshotDay}`}
              </div>
              <div className="text-xl font-bold">{a.traffic?.impressions ?? 0} impressions</div>
              <div className="text-sm text-[var(--color-pib-text-muted)]">
                {a.traffic?.clicks ?? 0} clicks · {a.rankings?.top10 ?? 0} top-10 keywords
              </div>
              {a.publicShareToken && (
                <a
                  href={`/seo-audit/${a.publicShareToken}`}
                  target="_blank"
                  rel="noopener"
                  className="text-xs underline"
                >
                  Open report
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
