import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, string> = {
  proposed: 'bg-blue-100 text-blue-800',
  approved: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-amber-100 text-amber-800',
  applied: 'bg-cyan-100 text-cyan-800',
  rejected: 'bg-gray-100 text-gray-700',
  measured: 'bg-green-100 text-green-800',
}

const RESULT_PILL: Record<string, string> = {
  win: 'bg-green-100 text-green-800',
  'no-change': 'bg-gray-100 text-gray-700',
  loss: 'bg-red-100 text-red-800',
}

export default async function OptimizationsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb
    .collection('seo_optimizations')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  opts.sort((a, b) => (b.detectedAt ?? '').localeCompare(a.detectedAt ?? ''))

  return (
    <div className="space-y-4">
      <header className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Optimizations — Karpathy autoresearch log ({opts.length})</h2>
        <form action={`/api/v1/seo/sprints/${id}/optimize`} method="POST">
          <button className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">Run optimization loop</button>
        </form>
      </header>
      {opts.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          No optimization proposals yet. The weekly cron generates these on Mondays based on sprint health.
        </div>
      ) : (
        <ul className="space-y-3">
          {opts.map((o) => (
            <li key={o.id} className="card p-5 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm">{o.hypothesis}</div>
                  <div className="text-xs text-[var(--color-pib-text-muted)]">
                    {o.signal?.type} · severity {o.signal?.severity}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_PILL[o.status] ?? ''}`}>{o.status}</span>
                  {o.result && (
                    <span className={`text-xs px-2 py-0.5 rounded ${RESULT_PILL[o.result] ?? ''}`}>{o.result}</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-[var(--color-pib-text-muted)]">→ {o.proposedAction}</p>
              {o.outcomeDelta && (
                <p className="text-xs">
                  Outcome: position {o.outcomeDelta.positionChange?.toFixed(1) ?? '—'} · impressions{' '}
                  {o.outcomeDelta.impressionsChange ?? '—'}
                </p>
              )}
              {o.status === 'proposed' && (
                <div className="flex gap-2 pt-2">
                  <form action={`/api/v1/seo/optimizations/${o.id}/approve`} method="POST">
                    <button className="text-xs px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700">
                      Approve
                    </button>
                  </form>
                  <form action={`/api/v1/seo/optimizations/${o.id}/reject`} method="POST">
                    <button className="text-xs px-3 py-1 rounded border hover:bg-gray-50">Reject</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
