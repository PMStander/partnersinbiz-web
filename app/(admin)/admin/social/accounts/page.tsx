'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useOrg } from '@/lib/contexts/OrgContext'

/* ------------------------------------------------------------------ */
/*  Types & config                                                     */
/* ------------------------------------------------------------------ */

type AccountStatus = 'active' | 'token_expired' | 'disconnected' | 'rate_limited'

interface SocialAccount {
  id: string
  platform: string
  displayName: string
  username: string
  status: AccountStatus
  lastUsedAt: any
  tokenExpiresAt: any
  platformMeta?: Record<string, any>
}

const PLATFORMS = [
  { id: 'twitter', label: 'X (Twitter)', color: 'bg-black', short: 'X', oauth: true },
  { id: 'linkedin', label: 'LinkedIn', color: 'bg-blue-700', short: 'LI', oauth: true },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600', short: 'FB', oauth: true },
  { id: 'instagram', label: 'Instagram', color: 'bg-pink-600', short: 'IG', oauth: true },
  { id: 'reddit', label: 'Reddit', color: 'bg-orange-600', short: 'RD', oauth: true },
  { id: 'tiktok', label: 'TikTok', color: 'bg-gray-800', short: 'TT', oauth: true },
  { id: 'pinterest', label: 'Pinterest', color: 'bg-red-700', short: 'PI', oauth: true },
  { id: 'bluesky', label: 'Bluesky', color: 'bg-sky-500', short: 'BS', oauth: false, note: 'Uses app password' },
  { id: 'threads', label: 'Threads', color: 'bg-gray-700', short: 'TH', oauth: true },
] as const

const STATUS_STYLES: Record<AccountStatus, string> = {
  active: 'bg-green-900/30 text-green-400',
  token_expired: 'bg-red-900/30 text-red-400',
  disconnected: 'bg-surface-container-high text-on-surface-variant',
  rate_limited: 'bg-yellow-900/30 text-yellow-400',
}

const STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active',
  token_expired: 'Token Expired',
  disconnected: 'Disconnected',
  rate_limited: 'Rate Limited',
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function tsToDate(ts: any): Date | null {
  if (!ts) return null
  if (ts._seconds) return new Date(ts._seconds * 1000)
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function fmtDateTime(ts: any) {
  const d = tsToDate(ts)
  return d
    ? d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'
}

function daysUntil(ts: any): number | null {
  const d = tsToDate(ts)
  if (!d) return null
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function platformConfig(id: string) {
  return PLATFORMS.find((p) => p.id === id)
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PlatformBadge({ platformId }: { platformId: string }) {
  const cfg = platformConfig(platformId)
  if (!cfg) {
    return <span className="bg-surface-container-high text-on-surface-variant text-[10px] px-2 py-0.5 rounded font-bold uppercase">{platformId}</span>
  }
  return <span className={`${cfg.color} text-white text-[10px] px-2 py-0.5 rounded font-bold`}>{cfg.short}</span>
}

function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function TokenExpiryWarning({ tokenExpiresAt }: { tokenExpiresAt: any }) {
  const days = daysUntil(tokenExpiresAt)
  if (days === null) return null
  if (days <= 0) {
    return <span className="text-[10px] text-red-400 font-medium">Token expired</span>
  }
  if (days <= 7) {
    return <span className="text-[10px] text-yellow-400 font-medium">Expires in {days}d</span>
  }
  return <span className="text-[10px] text-on-surface-variant">Expires in {days}d</span>
}

function SuccessBanner({ platform, onDismiss }: { platform: string; onDismiss: () => void }) {
  const cfg = platformConfig(platform)
  return (
    <div className="rounded-xl bg-green-900/20 border border-green-800/40 p-4 flex items-center justify-between">
      <p className="text-sm text-green-400">
        Successfully connected <span className="font-semibold">{cfg?.label ?? platform}</span>.
      </p>
      <button onClick={onDismiss} className="text-green-400 hover:text-green-300 text-xs font-medium ml-4">
        Dismiss
      </button>
    </div>
  )
}

function AccountCard({
  account,
  onDisconnect,
  onRefresh,
  disconnecting,
}: {
  account: SocialAccount
  onDisconnect: (id: string) => void
  onRefresh: (id: string) => void
  disconnecting: boolean
}) {
  const cfg = platformConfig(account.platform)

  return (
    <div className="rounded-xl bg-surface-container p-5 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <PlatformBadge platformId={account.platform} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-on-surface truncate">{account.displayName}</p>
          <p className="text-xs text-on-surface-variant truncate">@{account.username}</p>
        </div>
        <StatusBadge status={account.status} />
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div>
          <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Last used </span>
          <span className="text-xs text-on-surface-variant">{fmtDateTime(account.lastUsedAt)}</span>
        </div>
        {account.tokenExpiresAt && (
          <TokenExpiryWarning tokenExpiresAt={account.tokenExpiresAt} />
        )}
        {cfg && !cfg.oauth && cfg.note && (
          <span className="text-[10px] text-on-surface-variant/60 italic">{cfg.note}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => onRefresh(account.id)}
          className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
        >
          Refresh Token
        </button>
        <button
          onClick={() => onDisconnect(account.id)}
          disabled={disconnecting}
          className="px-4 py-2 rounded-lg bg-red-900/30 text-red-400 font-label text-sm font-medium hover:bg-red-900/50 transition-colors disabled:opacity-50"
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    </div>
  )
}

function BlueskyForm({ onSuccess }: { onSuccess: () => void }) {
  const { orgId } = useOrg()
  const [handle, setHandle] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim() || !appPassword.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/social/accounts${orgId ? `?orgId=${orgId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'bluesky',
          displayName: handle.trim(),
          username: handle.trim(),
          status: 'active',
          platformMeta: { handle: handle.trim(), appPassword: appPassword.trim() },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed (${res.status})`)
      }
      setHandle('')
      setAppPassword('')
      onSuccess()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-surface-container p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <PlatformBadge platformId="bluesky" />
        <span className="text-sm font-medium text-on-surface">Connect Bluesky</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide block mb-1">
            Handle
          </label>
          <input
            type="text"
            placeholder="you.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm placeholder:text-on-surface-variant/40 outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide block mb-1">
            App Password
          </label>
          <input
            type="password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm placeholder:text-on-surface-variant/40 outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !handle.trim() || !appPassword.trim()}
        className="px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
      >
        {submitting ? 'Connecting...' : 'Connect Bluesky'}
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AccountsPage() {
  const { orgId } = useOrg()
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [successPlatform, setSuccessPlatform] = useState<string | null>(null)

  /* Show success banner from OAuth redirect */
  useEffect(() => {
    if (searchParams.get('status') === 'success' && searchParams.get('platform')) {
      setSuccessPlatform(searchParams.get('platform'))
    }
  }, [searchParams])

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/social/accounts${orgId ? `?orgId=${orgId}` : ''}`)
      const body = await res.json()
      setAccounts(body.data ?? [])
    } catch {
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  async function handleDisconnect(id: string) {
    if (!confirm('Disconnect this account? You can reconnect later.')) return
    setDisconnectingId(id)
    try {
      await fetch(`/api/v1/social/accounts/${id}`, { method: 'DELETE' })
      setAccounts((prev) => prev.filter((a) => a.id !== id))
    } finally {
      setDisconnectingId(null)
    }
  }

  async function handleRefresh(id: string) {
    try {
      await fetch(`/api/v1/social/accounts/${id}/refresh`, { method: 'POST' })
      await fetchAccounts()
    } catch {
      // Silently fail — refresh endpoint may not exist yet
    }
  }

  /* Compute which platforms are not yet connected */
  const connectedPlatformIds = new Set(accounts.map((a) => a.platform))
  const unconnectedOAuth = PLATFORMS.filter((p) => p.oauth && !connectedPlatformIds.has(p.id))
  const showBlueskyForm = !connectedPlatformIds.has('bluesky')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Social Accounts</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Connect and manage your social media accounts
        </p>
      </div>

      {/* Success banner */}
      {successPlatform && (
        <SuccessBanner platform={successPlatform} onDismiss={() => setSuccessPlatform(null)} />
      )}

      {/* Connected Accounts */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
          Connected Accounts
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl bg-surface-container p-8 text-center">
            <p className="text-sm text-on-surface-variant">No accounts connected yet.</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              Use the buttons below to connect your first account.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onDisconnect={handleDisconnect}
                onRefresh={handleRefresh}
                disconnecting={disconnectingId === account.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Connect New Accounts */}
      {(unconnectedOAuth.length > 0 || showBlueskyForm) && (
        <div>
          <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
            Connect New Account
          </h2>

          {/* OAuth platforms */}
          {unconnectedOAuth.length > 0 && (
            <div className="flex gap-3 flex-wrap mb-4">
              {unconnectedOAuth.map((p) => (
                <a
                  key={p.id}
                  href={`/api/v1/social/oauth/${p.id}?redirectUrl=/admin/social/accounts`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors"
                >
                  <span className={`${p.color} text-white text-[10px] px-1.5 py-0.5 rounded font-bold`}>
                    {p.short}
                  </span>
                  Connect {p.label}
                </a>
              ))}
            </div>
          )}

          {/* Bluesky inline form */}
          {showBlueskyForm && <BlueskyForm onSuccess={fetchAccounts} />}

        </div>
      )}
    </div>
  )
}
