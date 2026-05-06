'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import type { EmailDomain, EmailDomainStatus, EmailDomainDnsRecord } from '@/lib/email/domains'

interface OrganizationSummary {
  id: string
  slug: string
  name: string
}

const STATUS_STYLES: Record<EmailDomainStatus, string> = {
  verified: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  not_started: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  temporary_failure: 'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<EmailDomainStatus, string> = {
  verified: 'Verified',
  pending: 'Pending',
  not_started: 'Not started',
  failed: 'Failed',
  temporary_failure: 'Temporary failure',
}

function StatusBadge({ status }: { status: EmailDomainStatus }) {
  const cls = STATUS_STYLES[status] ?? 'bg-surface-container text-on-surface-variant'
  const label = STATUS_LABELS[status] ?? status
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // ignore
        }
      }}
      className="px-2 py-1 rounded-md text-xs bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
      type="button"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function DnsRecordsTable({ records }: { records: EmailDomainDnsRecord[] }) {
  if (!records.length) {
    return (
      <p className="text-sm text-on-surface-variant py-2">
        No DNS records returned. Try refreshing.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-outline-variant">
      <table className="w-full text-sm">
        <thead className="bg-surface-container">
          <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Host / Name</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium w-16"></th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, idx) => (
            <tr
              key={`${rec.record}-${rec.name}-${idx}`}
              className="border-t border-outline-variant align-top"
            >
              <td className="px-3 py-2 font-mono text-xs text-on-surface">
                {rec.record}
                {rec.type ? <span className="text-on-surface-variant"> / {rec.type}</span> : null}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-on-surface break-all">
                {rec.name}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-on-surface break-all">
                {rec.value}
                {rec.priority !== undefined && (
                  <span className="block text-on-surface-variant mt-0.5">priority {rec.priority}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-on-surface-variant">
                {rec.status ?? '—'}
              </td>
              <td className="px-3 py-2">
                <CopyButton value={rec.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DomainCard({
  domain,
  onRefreshed,
  onDeleted,
}: {
  domain: EmailDomain
  onRefreshed: (d: EmailDomain) => void
  onDeleted: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(domain.status !== 'verified')
  const [refreshing, setRefreshing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/email/domains/${domain.id}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Failed to refresh')
        return
      }
      onRefreshed(body.data as EmailDomain)
    } catch {
      setError('Failed to refresh')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${domain.name}? This will unverify the domain in Resend.`)) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/email/domains/${domain.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Failed to delete')
        setDeleting(false)
        return
      }
      onDeleted(domain.id)
    } catch {
      setError('Failed to delete')
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl bg-surface-container border border-outline-variant p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">dns</span>
          <div className="min-w-0">
            <p className="font-medium text-on-surface truncate">{domain.name}</p>
            <p className="text-xs text-on-surface-variant">
              {domain.region || 'default region'}
            </p>
          </div>
          <StatusBadge status={domain.status} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg bg-surface text-on-surface text-sm border border-outline-variant hover:bg-surface-container-high disabled:opacity-50 transition-colors"
            type="button"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-surface text-on-surface text-sm border border-outline-variant hover:bg-surface-container-high transition-colors"
            type="button"
          >
            {expanded ? 'Hide DNS' : 'Show DNS'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded-lg bg-surface text-red-600 text-sm border border-outline-variant hover:bg-red-50 disabled:opacity-50 transition-colors"
            type="button"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      {expanded && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-on-surface-variant">
            Add these records at your DNS host. Once propagated, click Refresh to re-check Resend.
          </p>
          <DnsRecordsTable records={domain.dnsRecords ?? []} />
        </div>
      )}
    </div>
  )
}

export default function EmailDomainsPage() {
  const params = useParams()
  const slug = params.slug as string

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string>('')
  const [orgLookupDone, setOrgLookupDone] = useState(false)

  const [domains, setDomains] = useState<EmailDomain[]>([])
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Resolve slug → orgId
  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/organizations')
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return
        const list = (body.data ?? []) as OrganizationSummary[]
        const match = list.find((o) => o.slug === slug)
        setOrgId(match?.id ?? null)
        setOrgName(match?.name ?? '')
        setOrgLookupDone(true)
      })
      .catch(() => {
        if (!cancelled) setOrgLookupDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const loadDomains = useCallback((id: string) => {
    setLoading(true)
    fetch(`/api/v1/email/domains?orgId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((body) => {
        setDomains((body.data ?? []) as EmailDomain[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!orgId) return
    loadDomains(orgId)
  }, [orgId, loadDomains])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    const name = newName.trim().toLowerCase()
    if (!name) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/v1/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, name }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFormError(body.error ?? 'Failed to add domain')
        return
      }
      setNewName('')
      // Refresh full list to get the canonical record shape
      loadDomains(orgId)
    } catch {
      setFormError('Failed to add domain')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRefreshed(updated: EmailDomain) {
    setDomains((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)))
  }

  function handleDeleted(id: string) {
    setDomains((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          {orgName ? orgName : 'Workspace'}
        </p>
        <h1 className="text-2xl font-semibold text-on-surface">Email Domains</h1>
        <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
          Verify a domain you own to send campaigns from your own brand. Until verified,
          campaigns fall back to the shared partnersinbiz.online domain.
        </p>
      </div>

      <div className="rounded-xl bg-surface-container border border-outline-variant p-4">
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ahs-law.co.za"
            className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            disabled={submitting || !orgId}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={submitting || !orgId || !newName.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add domain'}
          </button>
        </form>
        {formError && (
          <p className="mt-2 text-sm text-red-600">{formError}</p>
        )}
        {orgLookupDone && !orgId && (
          <p className="mt-2 text-sm text-red-600">
            Could not find an organisation for slug &quot;{slug}&quot;.
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant rounded-xl">
          No domains yet. Add one above to start the verification process.
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map((domain) => (
            <DomainCard
              key={domain.id}
              domain={domain}
              onRefreshed={handleRefreshed}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}
