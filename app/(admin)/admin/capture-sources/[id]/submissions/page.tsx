// app/(admin)/admin/capture-sources/[id]/submissions/page.tsx
//
// Standalone paginated submissions view for a capture source.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase/admin'
import {
  LEAD_CAPTURE_SOURCES,
  LEAD_CAPTURE_SUBMISSIONS,
  type CaptureSource,
  type CaptureSubmission,
} from '@/lib/lead-capture/types'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}

const PAGE_SIZE = 50

function tsToDate(t: CaptureSubmission['createdAt']): string {
  const seconds = (t as { _seconds?: number; seconds?: number } | null)?._seconds
    ?? (t as { seconds?: number } | null)?.seconds
  if (!seconds) return '—'
  try {
    return new Date(seconds * 1000).toLocaleString()
  } catch {
    return '—'
  }
}

export default async function SubmissionsListPage({ params, searchParams }: Props) {
  const { id } = await params
  const { page: pageParam } = await searchParams
  const page = Math.max(parseInt(pageParam ?? '1'), 1)

  const sourceSnap = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).get()
  if (!sourceSnap.exists || sourceSnap.data()?.deleted) notFound()
  const source = { id: sourceSnap.id, ...sourceSnap.data() } as CaptureSource

  const snap = await adminDb
    .collection(LEAD_CAPTURE_SUBMISSIONS)
    .where('captureSourceId', '==', id)
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: CaptureSubmission[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  all.sort((a, b) => {
    const as = (a.createdAt as { _seconds?: number; seconds?: number } | null)?._seconds ?? 0
    const bs = (b.createdAt as { _seconds?: number; seconds?: number } | null)?._seconds ?? 0
    return bs - as
  })
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
  const slice = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <Link href={`/admin/capture-sources/${id}`} className="text-sm text-primary">← Back to {source.name}</Link>
      </div>
      <h1 className="text-2xl font-semibold text-on-surface mb-1">Submissions</h1>
      <p className="text-sm text-on-surface-variant mb-6">{all.length} total</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-on-surface-variant">
            <tr>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Data</th>
              <th className="py-2 pr-4">Confirmed</th>
              <th className="py-2 pr-4">Contact</th>
              <th className="py-2 pr-4">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((s) => (
              <tr key={s.id} className="border-t border-outline-variant">
                <td className="py-2 pr-4 font-medium text-on-surface">{s.email}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{Object.entries(s.data || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}</td>
                <td className="py-2 pr-4">{s.confirmedAt ? <span className="text-green-700">Yes</span> : <span className="text-yellow-700">Pending</span>}</td>
                <td className="py-2 pr-4 text-on-surface-variant truncate max-w-[10ch]">{s.contactId}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{tsToDate(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex gap-2 text-sm">
          {page > 1 && <Link href={`?page=${page - 1}`} className="px-3 py-1 rounded bg-surface-container">← Prev</Link>}
          <span className="px-3 py-1 text-on-surface-variant">Page {page} of {totalPages}</span>
          {page < totalPages && <Link href={`?page=${page + 1}`} className="px-3 py-1 rounded bg-surface-container">Next →</Link>}
        </div>
      )}
    </div>
  )
}
