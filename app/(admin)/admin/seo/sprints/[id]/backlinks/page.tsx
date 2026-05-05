import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-800',
  live: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  lost: 'bg-amber-100 text-amber-800',
}

export default async function BacklinksTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb
    .collection('seo_backlinks')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const links = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

  // Group by type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: Record<string, any[]> = {}
  for (const l of links) {
    groups[l.type] ??= []
    groups[l.type].push(l)
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Backlinks ({links.length})</h2>
        <p className="text-xs text-[var(--color-pib-text-muted)]">
          {links.filter((l) => l.status === 'live').length} live ·{' '}
          {links.filter((l) => l.status === 'submitted').length} submitted
        </p>
      </header>

      {Object.entries(groups).map(([type, items]) => (
        <div key={type} className="space-y-2">
          <h3 className="text-sm font-medium capitalize">
            {type.replace('_', ' ')} ({items.length})
          </h3>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-left border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Domain</th>
                  <th className="px-4 py-2">DR</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Submitted</th>
                  <th className="px-4 py-2">Live</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 font-medium">{l.source}</td>
                    <td className="px-4 py-2 text-xs">{l.domain}</td>
                    <td className="px-4 py-2">{l.theirDR ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_PILL[l.status] ?? ''}`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">{l.submittedAt ? new Date(l.submittedAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2 text-xs">{l.liveAt ? new Date(l.liveAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
