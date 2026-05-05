import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, string> = {
  idea: 'bg-gray-100 text-gray-700',
  drafting: 'bg-amber-100 text-amber-800',
  review: 'bg-purple-100 text-purple-800',
  scheduled: 'bg-blue-100 text-blue-800',
  live: 'bg-green-100 text-green-800',
}

export default async function PortalContentTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb
    .collection('seo_content')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Editorial pipeline</h2>
      {content.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          No content planned yet.
        </div>
      ) : (
        <div className="card divide-y">
          {content.map((c) => (
            <div key={c.id} className="px-5 py-4 flex justify-between items-start">
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-[var(--color-pib-text-muted)]">
                  {c.type}
                  {c.publishDate && ` · ${new Date(c.publishDate).toLocaleDateString()}`}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_PILL[c.status] ?? ''}`}>{c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
