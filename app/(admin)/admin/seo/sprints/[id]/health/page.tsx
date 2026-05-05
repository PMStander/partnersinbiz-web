import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function HealthTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb.collection('seo_sprints').doc(id).get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprint = snap.data() as any
  const integrations = sprint?.integrations ?? {}
  const signals = sprint?.health?.signals ?? []

  function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-0">
        <div>
          <div className="font-medium text-sm">{label}</div>
          <div className="text-xs text-[var(--color-pib-text-muted)]">{detail}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
          {ok ? 'OK' : 'Action needed'}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h3 className="font-semibold text-sm mb-3">Integrations</h3>
        <StatusRow
          label="Google Search Console"
          ok={!!integrations.gsc?.connected && integrations.gsc?.tokenStatus !== 'expired'}
          detail={
            integrations.gsc?.connected
              ? `Connected to ${integrations.gsc.propertyUrl ?? '(no property selected)'}`
              : 'Not connected'
          }
        />
        <StatusRow
          label="Bing Webmaster Tools"
          ok={!!integrations.bing?.connected}
          detail={integrations.bing?.connected ? `Connected: ${integrations.bing.siteUrl}` : 'Not connected'}
        />
        <StatusRow
          label="PageSpeed Insights"
          ok={!!integrations.pagespeed?.enabled}
          detail={integrations.pagespeed?.enabled ? 'Enabled' : 'Disabled'}
        />
      </section>

      <section className="card p-5">
        <h3 className="font-semibold text-sm mb-3">Active signals ({signals.length})</h3>
        {signals.length === 0 ? (
          <p className="text-xs text-[var(--color-pib-text-muted)]">No active health signals 🎉</p>
        ) : (
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {signals.map((s: any, i: number) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{s.type}</span>{' '}
                <span className={`text-xs px-2 py-0.5 rounded ml-2 ${s.severity === 'high' ? 'bg-red-100 text-red-800' : s.severity === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                  {s.severity}
                </span>
                <pre className="text-xs text-[var(--color-pib-text-muted)] mt-1">{JSON.stringify(s.evidence, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
