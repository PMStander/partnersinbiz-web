import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function ContentTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb.collection('seo_content').where('sprintId', '==', id).where('deleted', '==', false).get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Content ({items.length})</h2>
      {items.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          No content yet. Add via <code>POST /api/v1/seo/sprints/{id}/content</code>.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-left border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Publish date</th>
                <th className="px-4 py-2">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-medium">{c.title}</td>
                  <td className="px-4 py-2 text-xs">{c.type}</td>
                  <td className="px-4 py-2 text-xs">{c.status}</td>
                  <td className="px-4 py-2 text-xs">
                    {c.publishDate ? new Date(c.publishDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {c.targetUrl ? <a href={c.targetUrl} className="underline">link</a> : '—'}
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
