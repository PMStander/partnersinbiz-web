import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function AuditsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb.collection('seo_audits').where('sprintId', '==', id).where('deleted', '==', false).get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audits = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  audits.sort((a, b) => (a.snapshotDay ?? 0) - (b.snapshotDay ?? 0))
  return (
    <div className="space-y-4">
      <header className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Audits ({audits.length})</h2>
        <form action={`/api/v1/seo/sprints/${id}/audits`} method="POST">
          <button className="text-sm px-3 py-1.5 rounded bg-black text-white hover:bg-gray-800">
            Generate snapshot now
          </button>
        </form>
      </header>
      {audits.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          No audits yet. Day 1 / 30 / 60 / 90 snapshots will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {audits.map((a) => (
            <div key={a.id} className="card p-5 space-y-2">
              <div className="text-xs text-[var(--color-pib-text-muted)]">
                {a.snapshotDay === 1 ? 'Day 1 baseline' : `Day ${a.snapshotDay}`}
              </div>
              <div className="text-sm">
                <strong>{a.traffic?.impressions ?? 0}</strong> impressions ·{' '}
                <strong>{a.traffic?.clicks ?? 0}</strong> clicks
              </div>
              <div className="text-xs text-[var(--color-pib-text-muted)]">
                {a.rankings?.top10 ?? 0} top-10 · {a.authority?.totalBacklinks ?? 0} backlinks
              </div>
              <div className="flex gap-2 pt-2">
                <a
                  href={`/api/v1/seo/audits/${a.id}/share`}
                  className="text-xs underline"
                >
                  Share
                </a>
                <a href={`/api/v1/seo/audits/${a.id}/report.pdf`} className="text-xs underline">
                  PDF
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
