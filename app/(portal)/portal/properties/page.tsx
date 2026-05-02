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

const PROVIDER_ICON: Record<string, string> = {
  adsense: 'ads_click',
  admob: 'ads_click',
  revenuecat: 'subscriptions',
  app_store_connect: 'phone_iphone',
  play_console: 'android',
  google_ads: 'campaign',
  ga4: 'analytics',
  firebase_analytics: 'flame',
}

const STATUS_PILL: Record<string, string> = {
  connected: 'pib-pill-success',
  paused: 'pib-pill-warn',
  reauth_required: 'pib-pill-warn',
  error: 'pib-pill-danger',
  pending: 'pib-pill-info',
}

const TYPE_ICON: Record<string, string> = {
  web: 'language',
  ios: 'phone_iphone',
  android: 'android',
  app: 'apps',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`pib-pill ${STATUS_PILL[status] ?? ''}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status.replace(/_/g, ' ')}
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
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Your stack</p>
        <h1 className="pib-page-title mt-2">Properties</h1>
        <p className="pib-page-sub max-w-2xl">
          Each property — site, iOS app, Android app — and the data sources we&rsquo;ve connected for you.
        </p>
      </header>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="pib-skeleton h-32" />
          ))}
        </div>
      ) : !data || data.properties.length === 0 ? (
        <div className="bento-card p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-pib-accent)]">apartment</span>
          <h2 className="font-display text-2xl mt-4">No properties yet.</h2>
          <p className="text-sm text-[var(--color-pib-text-muted)] max-w-md mx-auto mt-2">
            Properties are created during onboarding. Reach out via Messages if you need one added.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.properties.map((p) => {
            const conns = byProperty.get(p.id) ?? []
            const icon = TYPE_ICON[p.type] ?? 'inventory_2'
            return (
              <div key={p.id} className="pib-card-section">
                <div className="pib-card-section-header flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px] text-[var(--color-pib-accent)]">{icon}</span>
                    </div>
                    <div>
                      <h3 className="font-display text-xl leading-tight">{p.name}</h3>
                      <p className="eyebrow !text-[10px] mt-1">{p.type} · {p.domain}</p>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-pib-text-muted)] font-mono whitespace-nowrap">
                    {conns.length} connection{conns.length === 1 ? '' : 's'}
                  </span>
                </div>
                {conns.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--color-pib-line)]">
                    {conns.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 bg-[var(--color-pib-surface)] hover:bg-[var(--color-pib-surface-2)] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-text-muted)]">
                            {PROVIDER_ICON[c.provider] ?? 'cable'}
                          </span>
                          <span className="text-sm truncate">{PROVIDER_LABEL[c.provider] ?? c.provider}</span>
                        </div>
                        <StatusPill status={c.status} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-4 text-sm text-[var(--color-pib-text-muted)] italic">
                    No data sources connected yet.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
