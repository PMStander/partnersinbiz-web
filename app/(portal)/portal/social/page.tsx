'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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

const STATUS_COLORS: Record<string, string> = {
  active: 'border-green-400/40 text-green-300',
  token_expired: 'border-red-400/40 text-red-300',
  disconnected: 'border-white/10 text-white/30',
  rate_limited: 'border-yellow-400/40 text-yellow-300',
}

function PlatformBadge({ platform }: { platform: string }) {
  const config = PLATFORM_COLORS[platform] ?? { bg: 'bg-gray-600', label: platform.slice(0, 2).toUpperCase() }
  return <span className={`${config.bg} text-white text-[10px] px-2 py-0.5 rounded font-bold`}>{config.label}</span>
}

function getPostText(post: any): string {
  if (typeof post.content === 'string') return post.content
  if (post.content?.text) return post.content.text
  return ''
}

function getPostPlatforms(post: any): string[] {
  if (post.platforms?.length) return post.platforms
  if (post.platform) return [post.platform]
  return []
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null
  if (ts._seconds) return new Date(ts._seconds * 1000)
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function fmtDate(ts: any) {
  const d = tsToDate(ts)
  return d ? d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}

export default function PortalSocialDashboard() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/social/accounts').then(r => r.json()),
      fetch('/api/v1/social/posts?limit=20').then(r => r.json()),
      fetch('/api/v1/organizations').then(r => r.json()),
    ]).then(([accBody, postBody, orgBody]) => {
      setAccounts(accBody.data ?? [])
      setPosts(postBody.data ?? [])
      if (orgBody.data?.[0]?.name) setOrgName(orgBody.data[0].name)
    }).finally(() => setLoading(false))
  }, [])

  const activeAccounts = accounts.filter(a => a.status === 'active')
  const scheduled = posts.filter(p => p.status === 'scheduled').length
  const published = posts.filter(p => p.status === 'published').length
  const recentPosts = posts.slice(0, 8)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Social Media</h1>
        {orgName && <p className="text-xs text-on-surface-variant/60 mt-0.5">{orgName}</p>}
        <p className="text-sm text-white/40 mt-1">Manage your social media presence</p>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-white/10 p-6 text-center">
            <p className="text-4xl font-headline font-bold tracking-tighter">{activeAccounts.length}</p>
            <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">Connected</p>
          </div>
          <div className="border border-white/10 p-6 text-center">
            <p className="text-4xl font-headline font-bold tracking-tighter text-blue-300">{scheduled}</p>
            <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">Scheduled</p>
          </div>
          <div className="border border-white/10 p-6 text-center">
            <p className="text-4xl font-headline font-bold tracking-tighter text-green-300">{published}</p>
            <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">Published</p>
          </div>
          <div className="border border-white/10 p-6 text-center">
            <p className="text-4xl font-headline font-bold tracking-tighter">{posts.length}</p>
            <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">Total Posts</p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/portal/social/compose"
          className="px-4 py-2 text-sm font-label font-bold uppercase tracking-widest border border-white text-white hover:bg-white hover:text-black transition-colors"
        >
          Compose Post
        </Link>
        <Link
          href="/portal/social/history"
          className="px-4 py-2 text-sm font-label uppercase tracking-widest border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
        >
          Post History
        </Link>
        <Link
          href="/portal/social/accounts"
          className="px-4 py-2 text-sm font-label uppercase tracking-widest border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
        >
          Manage Accounts
        </Link>
      </div>

      {/* Connected Accounts */}
      <div>
        <h2 className="text-xs font-label uppercase tracking-widest text-white/30 mb-3">Connected Accounts</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="border border-white/10 p-5 animate-pulse h-16" />
            ))}
          </div>
        ) : activeAccounts.length === 0 ? (
          <div className="border border-white/10 p-8 text-center">
            <p className="text-white/40 mb-4">No accounts connected yet.</p>
            <Link href="/portal/social/accounts" className="text-white underline text-sm">Connect an account →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeAccounts.map((acc: any) => (
              <div key={acc.id} className="border border-white/10 p-4 flex items-center gap-3">
                <PlatformBadge platform={acc.platform} />
                <div className="flex-1 min-w-0">
                  <p className="font-headline font-bold tracking-tight truncate">{acc.displayName}</p>
                  <p className="text-white/40 text-xs">@{acc.username || acc.displayName}</p>
                </div>
                <span className={`text-xs font-label uppercase tracking-widest border px-2 py-0.5 ${STATUS_COLORS[acc.status] ?? 'border-white/20 text-white/40'}`}>
                  {acc.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Posts */}
      <div>
        <h2 className="text-xs font-label uppercase tracking-widest text-white/30 mb-3">Recent Posts</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-white/10 p-5 animate-pulse h-16" />
            ))}
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="border border-white/10 p-8 text-center">
            <p className="text-white/40">No posts yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentPosts.map((post: any) => (
              <div key={post.id} className="border border-white/10 p-4 flex items-center gap-3">
                <div className="flex gap-1">
                  {getPostPlatforms(post).map(p => (
                    <PlatformBadge key={p} platform={p} />
                  ))}
                </div>
                <p className="flex-1 text-sm text-white/80 truncate min-w-0">
                  {getPostText(post).slice(0, 80)}
                </p>
                <span className={`text-xs font-label uppercase tracking-widest border px-2 py-0.5 ${
                  post.status === 'published' ? 'border-green-400/40 text-green-300' :
                  post.status === 'scheduled' ? 'border-blue-400/40 text-blue-300' :
                  post.status === 'failed' ? 'border-red-400/40 text-red-300' :
                  'border-white/20 text-white/40'
                }`}>
                  {post.status}
                </span>
                <span className="text-xs text-white/30 flex-shrink-0">{fmtDate(post.scheduledAt ?? post.scheduledFor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
