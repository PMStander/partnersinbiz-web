'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Property, PropertyStatus } from '@/lib/properties/types'

const STATUS_MAP: Record<PropertyStatus, { label: string; color: string }> = {
  draft:    { label: 'Draft',    color: 'var(--color-outline)' },
  active:   { label: 'Active',   color: '#4ade80' },
  paused:   { label: 'Paused',   color: '#facc15' },
  archived: { label: 'Archived', color: 'var(--color-outline)' },
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [orgMap, setOrgMap] = useState<Record<string, string>>({})
  const [orgFilter, setOrgFilter] = useState('')
  const [orgLoadError, setOrgLoadError] = useState(false)

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then(r => r.json())
      .then(body => {
        const map: Record<string, string> = {}
        for (const org of body.data ?? []) map[org.id] = org.name
        setOrgMap(map)
      })
      .catch(() => setOrgLoadError(true))
  }, [])

  useEffect(() => {
    if (!orgFilter) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/v1/properties?${new URLSearchParams({ orgId: orgFilter })}`)
      .then(r => r.json())
      .then(body => { setProperties(body.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [orgFilter])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Properties</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Marketing sites and apps connected to PiB
          </p>
        </div>
        <Link href="/admin/properties/new" className="pib-btn-primary text-sm font-label">
          + New Property
        </Link>
      </div>

      {/* Org filter */}
      <div className="pib-card p-4">
        <label className="text-xs text-on-surface-variant font-label block mb-1">Filter by Client</label>
        <select
          value={orgFilter}
          onChange={e => setOrgFilter(e.target.value)}
          className="pib-input text-sm w-64"
        >
          <option value="">Select a client…</option>
          {Object.entries(orgMap).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {orgLoadError && <p className="text-xs text-red-400 mt-1">Could not load clients. Refresh to retry.</p>}
      </div>

      {/* Properties list */}
      {!orgFilter ? (
        <div className="pib-card p-8 text-center text-on-surface-variant text-sm">
          Select a client above to view their properties.
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : properties.length === 0 ? (
        <div className="pib-card p-8 text-center text-on-surface-variant text-sm">
          No properties yet.{' '}
          <Link href="/admin/properties/new" className="text-[var(--color-accent-text)] underline">
            Create one.
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map(p => {
            const statusInfo = STATUS_MAP[p.status] ?? STATUS_MAP.draft
            return (
              <Link
                key={p.id}
                href={`/admin/properties/${p.id}`}
                className="pib-card p-4 flex items-center justify-between hover:bg-[var(--color-surface-container)] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-lg">◉</span>
                  <div>
                    <p className="text-sm font-label font-medium text-on-surface">{p.name}</p>
                    <p className="text-xs text-on-surface-variant">{p.domain} · {p.type}</p>
                  </div>
                </div>
                <span
                  className="text-[11px] font-label px-2 py-0.5 rounded-full"
                  style={{ background: `${statusInfo.color}22`, color: statusInfo.color }}
                >
                  {statusInfo.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
