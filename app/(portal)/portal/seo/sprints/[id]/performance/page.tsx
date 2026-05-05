import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function PortalPerformanceTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auditsSnap = await adminDb
    .collection('seo_audits')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audits = auditsSnap.docs.map((d) => d.data() as any).sort((a, b) => (a.snapshotDay ?? 0) - (b.snapshotDay ?? 0))
  const baseline = audits[0]
  const latest = audits[audits.length - 1]

  function pctChange(a?: number, b?: number) {
    if (!a || !b) return null
    return Math.round(((b - a) / a) * 100)
  }

  const imprPct = pctChange(baseline?.traffic?.impressions, latest?.traffic?.impressions)
  const clickPct = pctChange(baseline?.traffic?.clicks, latest?.traffic?.clicks)

  // Page health
  const phSnap = await adminDb.collection('seo_sprints').doc(id).collection('page_health').get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homepage = phSnap.docs[0]?.data() as any | undefined

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Impressions" value={latest?.traffic?.impressions ?? 0} change={imprPct} />
        <Stat label="Clicks" value={latest?.traffic?.clicks ?? 0} change={clickPct} />
        <Stat label="Top-10 keywords" value={latest?.rankings?.top10 ?? 0} />
      </section>
      {homepage && (
        <section className="card p-5 space-y-2">
          <h3 className="font-semibold text-sm">Core Web Vitals (homepage)</h3>
          <div className="grid grid-cols-3 text-center text-sm">
            <CWV label="LCP" value={homepage.lcp ? `${Math.round(homepage.lcp)}ms` : '—'} ok={homepage.lcp <= 2500} />
            <CWV label="CLS" value={homepage.cls?.toFixed?.(2) ?? '—'} ok={homepage.cls <= 0.1} />
            <CWV label="Performance" value={homepage.performance ?? '—'} ok={homepage.performance >= 75} />
          </div>
        </section>
      )}
      {audits.length === 0 && (
        <div className="card p-6 text-center text-sm text-[var(--color-pib-text-muted)]">
          Performance data appears here after the first audit snapshot.
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, change }: { label: string; value: number; change?: number | null }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-[var(--color-pib-text-muted)]">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {change != null && (
        <div className={`text-xs ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? '+' : ''}
          {change}% vs Day 1
        </div>
      )}
    </div>
  )
}

function CWV({ label, value, ok }: { label: string; value: string | number; ok: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-pib-text-muted)]">{label}</div>
      <div className={`text-lg font-semibold ${ok ? 'text-green-600' : 'text-amber-600'}`}>{value}</div>
    </div>
  )
}
