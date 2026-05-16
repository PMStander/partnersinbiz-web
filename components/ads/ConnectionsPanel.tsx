'use client'
import { useState } from 'react'
import type { AdConnection } from '@/lib/ads/types'

interface Props {
  orgSlug: string
  orgId: string
  connections: AdConnection[]
}

export function ConnectionsPanel({ orgSlug, orgId, connections }: Props) {
  const meta = connections.find((c) => c.platform === 'meta')
  const [connecting, setConnecting] = useState(false)

  async function startConnect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/v1/ads/connections/meta/authorize', {
        method: 'POST',
        headers: { 'X-Org-Id': orgId, 'X-Org-Slug': orgSlug },
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? 'Authorize failed')
      window.location.href = body.data.authorizeUrl
    } catch (err) {
      setConnecting(false)
      alert((err as Error).message)
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect Meta? This revokes ad account access.')) return
    const res = await fetch('/api/v1/ads/connections/meta', {
      method: 'DELETE',
      headers: { 'X-Org-Id': orgId },
    })
    const body = await res.json()
    if (body.success) window.location.reload()
    else alert(body.error)
  }

  async function refreshAccounts() {
    const res = await fetch('/api/v1/ads/connections/meta/ad-accounts?refresh=1', {
      headers: { 'X-Org-Id': orgId },
    })
    const body = await res.json()
    if (body.success) window.location.reload()
  }

  async function setDefault(adAccountId: string) {
    const res = await fetch(
      `/api/v1/ads/connections/meta/ad-accounts/${encodeURIComponent(adAccountId)}`,
      { method: 'PATCH', headers: { 'X-Org-Id': orgId } },
    )
    const body = await res.json()
    if (body.success) window.location.reload()
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Ad platform connections</h1>
        <p className="text-sm text-white/60 mt-1">
          Link ad platforms to manage paid social campaigns from PiB for {orgSlug}.
        </p>
      </header>

      <div className="rounded-lg border border-white/10 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Meta (Facebook + Instagram)</h2>
            <p className="text-xs text-white/50">
              {meta
                ? `Connected · ${meta.adAccounts.length} ad account${meta.adAccounts.length === 1 ? '' : 's'}`
                : 'Not connected'}
            </p>
          </div>
          {meta ? (
            <button
              className="btn-pib-ghost text-sm"
              onClick={disconnect}
            >
              Disconnect
            </button>
          ) : (
            <button
              className="btn-pib-accent text-sm"
              onClick={startConnect}
              disabled={connecting}
            >
              {connecting ? 'Redirecting…' : 'Connect Meta'}
            </button>
          )}
        </div>

        {meta && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Ad accounts</h3>
              <button className="text-xs text-white/60 underline" onClick={refreshAccounts}>
                Refresh
              </button>
            </div>
            <ul className="space-y-1">
              {meta.adAccounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded border border-white/5 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-white/40">
                      {a.id} · {a.currency} · {a.timezone}
                    </div>
                  </div>
                  {meta.defaultAdAccountId === a.id ? (
                    <span className="text-xs uppercase tracking-wide text-[#F5A623]">
                      Default
                    </span>
                  ) : (
                    <button
                      className="text-xs text-white/60 underline"
                      onClick={() => setDefault(a.id)}
                    >
                      Set default
                    </button>
                  )}
                </li>
              ))}
              {meta.adAccounts.length === 0 && (
                <li className="text-sm text-white/40">
                  No ad accounts found. Click Refresh after granting more permissions in Meta.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
