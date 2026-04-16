'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const PLATFORMS = [
  { id: 'twitter', label: 'X (Twitter)', bg: 'bg-black', oauth: true },
  { id: 'linkedin', label: 'LinkedIn', bg: 'bg-blue-700', oauth: true },
  { id: 'facebook', label: 'Facebook', bg: 'bg-blue-600', oauth: true },
  { id: 'instagram', label: 'Instagram', bg: 'bg-pink-600', oauth: true },
  { id: 'reddit', label: 'Reddit', bg: 'bg-orange-600', oauth: true },
  { id: 'tiktok', label: 'TikTok', bg: 'bg-gray-800', oauth: true },
  { id: 'pinterest', label: 'Pinterest', bg: 'bg-red-700', oauth: true },
  { id: 'threads', label: 'Threads', bg: 'bg-gray-700', oauth: true },
  { id: 'bluesky', label: 'Bluesky', bg: 'bg-sky-500', oauth: false },
]

const PLATFORM_COLORS: Record<string, { bg: string; label: string }> = {
  twitter: { bg: 'bg-black', label: 'X' },
  x: { bg: 'bg-black', label: 'X' },
  linkedin: { bg: 'bg-blue-700', label: 'LI' },
  facebook: { bg: 'bg-blue-600', label: 'FB' },
  instagram: { bg: 'bg-pink-600', label: 'IG' },
  reddit: { bg: 'bg-orange-600', label: 'RD' },
  tiktok: { bg: 'bg-gray-800', label: 'TT' },
  pinterest: { bg: 'bg-red-700', label: 'PI' },
  bluesky: { bg: 'bg-sky-500', label: 'BS' },
  threads: { bg: 'bg-gray-700', label: 'TH' },
}

const STATUS_STYLES: Record<string, string> = {
  active: 'border-green-400/40 text-green-300',
  token_expired: 'border-red-400/40 text-red-300',
  disconnected: 'border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]',
  rate_limited: 'border-yellow-400/40 text-yellow-300',
}

export default function PortalAccountsPage() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  // Bluesky form
  const [bskyHandle, setBskyHandle] = useState('')
  const [bskyPassword, setBskyPassword] = useState('')
  const [bskyConnecting, setBskyConnecting] = useState(false)

  useEffect(() => {
    const status = searchParams.get('status')
    const platform = searchParams.get('platform')
    const msg = searchParams.get('message')
    if (status === 'success' && platform) {
      setMessage(`Successfully connected ${platform}!`)
      setMessageType('success')
    } else if (status === 'error' && msg) {
      setMessage(decodeURIComponent(msg))
      setMessageType('error')
    }
  }, [searchParams])

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/social/accounts')
      const body = await res.json()
      setAccounts(body.data ?? [])
    } catch {
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  const handleDisconnect = async (accountId: string) => {
    setDisconnecting(accountId)
    try {
      await fetch(`/api/v1/social/accounts/${accountId}`, { method: 'DELETE' })
      setMessage('Account disconnected.')
      setMessageType('success')
      fetchAccounts()
    } catch {
      setMessage('Failed to disconnect account.')
      setMessageType('error')
    } finally {
      setDisconnecting(null)
    }
  }

  const handleBlueskyConnect = async () => {
    if (!bskyHandle.trim() || !bskyPassword.trim()) return
    setBskyConnecting(true)
    try {
      const res = await fetch('/api/v1/social/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'bluesky',
          displayName: bskyHandle,
          username: bskyHandle,
          status: 'active',
          platformMeta: { handle: bskyHandle, appPassword: bskyPassword },
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to connect')
      setMessage('Bluesky account connected!')
      setMessageType('success')
      setBskyHandle('')
      setBskyPassword('')
      fetchAccounts()
    } catch (err: any) {
      setMessage(err.message)
      setMessageType('error')
    } finally {
      setBskyConnecting(false)
    }
  }

  const connectedPlatformIds = new Set(accounts.filter(a => a.status !== 'disconnected').map(a => a.platform))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Social Accounts</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">Connect and manage your social media accounts</p>
      </div>

      {message && (
        <div className={`border p-4 text-sm ${messageType === 'success' ? 'border-green-400/40 text-green-300' : 'border-red-400/40 text-red-300'}`}>
          {message}
          <button onClick={() => setMessage('')} className="ml-3 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]">×</button>
        </div>
      )}

      {/* Connected Accounts */}
      <div>
        <h2 className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-3">Connected Accounts</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="pib-skeleton p-5 h-20" />
            ))}
          </div>
        ) : accounts.filter(a => a.status !== 'disconnected').length === 0 ? (
          <div className="pib-card text-center">
            <p className="text-[var(--color-on-surface-variant)]">No accounts connected yet. Connect one below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.filter(a => a.status !== 'disconnected').map((acc: any) => {
              const pcfg = PLATFORM_COLORS[acc.platform] ?? { bg: 'bg-gray-600', label: '??' }
              return (
                <div key={acc.id} className="pib-card p-4 flex items-center gap-4">
                  <span className={`${pcfg.bg} text-white text-[10px] px-2 py-0.5 rounded font-bold`}>{pcfg.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-headline font-bold tracking-tight">{acc.displayName}</p>
                    <p className="text-[var(--color-on-surface-variant)] text-xs">@{acc.username || acc.displayName}</p>
                  </div>
                  <span className={`text-xs font-label uppercase tracking-widest border px-2 py-0.5 ${STATUS_STYLES[acc.status] ?? 'border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]'}`}>
                    {acc.status === 'token_expired' ? 'Expired' : acc.status}
                  </span>
                  <button
                    onClick={() => handleDisconnect(acc.id)}
                    disabled={disconnecting === acc.id}
                    className="px-3 py-1.5 text-xs font-label uppercase tracking-widest border border-red-400/30 text-red-300 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    {disconnecting === acc.id ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Connect New Account */}
      <div>
        <h2 className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-3">Connect New Account</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PLATFORMS.map(plat => {
            const isConnected = connectedPlatformIds.has(plat.id)
            if (plat.oauth) {
              return (
                <a
                  key={plat.id}
                  href={`/api/v1/social/oauth/${plat.id}?redirectUrl=/portal/social/accounts`}
                  className={`pib-card p-4 flex items-center gap-3 transition-colors ${
                    isConnected ? 'opacity-50 pointer-events-none' : 'pib-card-hover'
                  }`}
                >
                  <span className={`${plat.bg} text-white text-xs px-2 py-1 rounded font-bold`}>
                    {PLATFORM_COLORS[plat.id]?.label ?? plat.id.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm font-label">
                    {isConnected ? `${plat.label} (connected)` : `Connect ${plat.label}`}
                  </span>
                  {!isConnected && <span className="text-[var(--color-on-surface-variant)] text-xs">→</span>}
                </a>
              )
            }
            return null
          })}
        </div>

        {/* Bluesky (App Password) */}
        <div className="pib-card p-4 mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="bg-sky-500 text-white text-xs px-2 py-1 rounded font-bold">BS</span>
            <span className="text-sm font-label">Connect Bluesky</span>
            <span className="text-xs text-[var(--color-on-surface-variant)]">(App Password)</span>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={bskyHandle}
              onChange={e => setBskyHandle(e.target.value)}
              placeholder="handle.bsky.social"
              className="flex-1 border border-[var(--color-outline-variant)] bg-transparent px-3 py-2 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] outline-none focus:border-[var(--color-on-surface-variant)]"
            />
            <input
              type="password"
              value={bskyPassword}
              onChange={e => setBskyPassword(e.target.value)}
              placeholder="App password"
              className="flex-1 border border-[var(--color-outline-variant)] bg-transparent px-3 py-2 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] outline-none focus:border-[var(--color-on-surface-variant)]"
            />
            <button
              onClick={handleBlueskyConnect}
              disabled={bskyConnecting || !bskyHandle || !bskyPassword}
              className="pib-btn-primary"
            >
              {bskyConnecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
