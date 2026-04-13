'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface OrgSummary {
  id: string
  name: string
  slug: string
  description: string
  logoUrl: string
  memberCount: number
  linkedClientId: string
  active: boolean
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then((r) => r.json())
      .then((b) => setOrgs(b.data ?? []))
      .catch(() => setFetchError('Failed to load organisations — please refresh'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-headline font-bold text-on-surface">Organisations</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Manage multi-tenant organisations</p>
        </div>
        <Link
          href="/admin/organizations/new"
          className="px-4 py-2 text-sm font-label bg-primary text-on-primary rounded hover:opacity-90 transition-opacity"
        >
          + New Organisation
        </Link>
      </div>

      {loading && (
        <div className="text-sm text-on-surface-variant">Loading…</div>
      )}

      {fetchError && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{fetchError}</p>
      )}

      {!loading && orgs.length === 0 && (
        <div className="border border-outline-variant rounded-lg p-8 text-center">
          <p className="text-on-surface-variant text-sm">No organisations yet.</p>
          <Link href="/admin/organizations/new" className="mt-3 inline-block text-sm text-primary hover:underline">
            Create your first organisation →
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.map((org) => (
          <Link
            key={org.id}
            href={`/admin/organizations/${org.id}`}
            className="block border border-outline-variant rounded-lg p-4 hover:border-primary transition-colors bg-surface"
          >
            <div className="flex items-start gap-3">
              {org.logoUrl ? (
                <img src={org.logoUrl} alt={org.name} className="w-10 h-10 rounded object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center text-sm font-bold text-on-surface-variant shrink-0">
                  {org.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-label font-semibold text-on-surface text-sm truncate">{org.name}</p>
                <p className="text-[11px] text-on-surface-variant/60 truncate">{org.slug}</p>
              </div>
            </div>
            {org.description && (
              <p className="mt-2 text-xs text-on-surface-variant line-clamp-2">{org.description}</p>
            )}
            <div className="mt-3 flex items-center gap-3 text-[11px] text-on-surface-variant/60">
              <span>{org.memberCount} member{org.memberCount !== 1 ? 's' : ''}</span>
              {org.linkedClientId && (
                <span className="text-primary">● Linked</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
