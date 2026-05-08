import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase/admin'
import { serializeForClient } from '@/lib/campaigns/serialize'

export const dynamic = 'force-dynamic'

export default async function CampaignCalendarTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = serializeForClient(snap.data() as any)
  if (c.deleted) notFound()
  const calendar = (c.calendar ?? []) as Array<Record<string, string | number | undefined>>

  if (calendar.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-[var(--color-pib-text-muted)]">
        No calendar planned. Run the content-engine skill to generate a 12-week calendar.
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-left border-b border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)] text-[var(--color-pib-text-muted)] uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2">Day</th>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Audience</th>
            <th className="px-4 py-2">Channel</th>
            <th className="px-4 py-2">Format</th>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Asset</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-pib-line)]">
          {calendar.map((row, i) => (
            <tr key={i} className="hover:bg-[var(--color-row-hover)]">
              <td className="px-4 py-2 text-xs">{row.day ?? '—'}</td>
              <td className="px-4 py-2 text-xs">{row.date ?? '—'}</td>
              <td className="px-4 py-2 text-xs">{row.audience ?? '—'}</td>
              <td className="px-4 py-2 text-xs">{row.channel ?? '—'}</td>
              <td className="px-4 py-2 text-xs">{row.format ?? '—'}</td>
              <td className="px-4 py-2">{row.title ?? '—'}</td>
              <td className="px-4 py-2 text-xs">{row.assetId ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
