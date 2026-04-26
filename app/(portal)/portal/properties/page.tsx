'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

interface PortalProperty { id: string; name: string; type: string; domain: string }
interface PortalConnection { id: string; provider: string; propertyId: string; status: string; lastSuccessAt?: { _seconds: number } | null }

interface PortalData { properties: PortalProperty[]; connections: PortalConnection[] }

const PROVIDER_LABEL: Record<string, string> = {
  adsense: 'AdSense',
  admob: 'AdMob',
  revenuecat: 'RevenueCat',
  app_store_connect: 'App Store Connect',
  play_console: 'Play Console',
  google_ads: 'Google Ads',
  ga4: 'Google Analytics',
  firebase_analytics: 'Firebase Analytics',
}

function StatusPill({ status }: { status: string }) {
  const m: Record<string, string> = {
    connected: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    reauth_required: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    pending: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-widest font-mono ${m[status] ?? 'bg-white/5 text-white/50 border-white/10'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status.replace('_', ' ')}
    </span>
  )
}

export default function PortalProperties() {
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/portal/dashboard')
      .then((r) => r.json())
      .then((b) => { setData(b); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const byProperty = (() => {
    const m = new Map<string, PortalConnection[]>()
    if (data) for (const c of data.connections) {
      const arr = m.get(c.propertyId) ?? []
      arr.push(c)
      m.set(c.propertyId, arr)
    }
    return m
  })()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Properties</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">
          Each property — site, iOS app, Android app — and its connected data sources.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="pib-skeleton h-24" />
          ))}
        </div>
      ) : !data || data.properties.length === 0 ? (
        <div className="pib-card p-8 text-center">
          <p className="font-headline text-xl mb-2">No properties yet.</p>
          <p className="text-sm text-[var(--color-on-surface-variant)] max-w-md mx-auto">
            Properties are created during onboarding. Reach out via Messages if you need one added.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.properties.map((p) => {
            const conns = byProperty.get(p.id) ?? []
            return (
              <div key={p.id} className="pib-card">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-headline text-lg">{p.name}</h3>
                    <p className="text-xs text-[var(--color-on-surface-variant)] uppercase tracking-widest font-label mt-1">{p.type} · {p.domain}</p>
                  </div>
                  <span className="text-xs text-[var(--color-on-surface-variant)] font-mono">{conns.length} connection{conns.length === 1 ? '' : 's'}</span>
                </div>
                {conns.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {conns.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-[var(--color-outline-variant)]">
                        <span className="text-sm">{PROVIDER_LABEL[c.provider] ?? c.provider}</span>
                        <StatusPill status={c.status} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-on-surface-variant)] italic">No data sources connected yet.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
