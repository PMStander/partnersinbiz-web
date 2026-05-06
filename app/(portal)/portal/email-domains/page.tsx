'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import type { EmailDomain, EmailDomainStatus, EmailDomainDnsRecord } from '@/lib/email/domains'

const STATUS_PILL: Record<EmailDomainStatus, string> = {
  verified:          'pib-pill pib-pill-success',
  pending:           'pib-pill pib-pill-warn',
  not_started:       'pib-pill pib-pill-warn',
  failed:            'pib-pill pib-pill-danger',
  temporary_failure: 'pib-pill pib-pill-danger',
}

const STATUS_LABEL: Record<EmailDomainStatus, string> = {
  verified: 'Verified',
  pending: 'Pending',
  not_started: 'Not started',
  failed: 'Failed',
  temporary_failure: 'Temporary failure',
}

function StatusBadge({ status }: { status: EmailDomainStatus }) {
  const cls = STATUS_PILL[status] ?? 'pib-pill'
  const label = STATUS_LABEL[status] ?? status
  return (
    <span className={cls}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
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
      className="px-2 py-1 rounded-md text-xs bg-[var(--color-pib-surface-2)] hover:bg-[var(--color-pib-accent-soft)] text-[var(--color-pib-text)] transition-colors border border-[var(--color-pib-line)]"
      type="button"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function DnsRecordsTable({ records }: { records: EmailDomainDnsRecord[] }) {
  if (!records.length) {
    return (
      <p className="text-sm text-[var(--color-pib-text-muted)] py-2">
        No DNS records returned. Try refreshing.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-pib-line)]">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.02]">
          <tr className="text-left">
            <th className="px-3 py-2 eyebrow !text-[10px]">Type</th>
            <th className="px-3 py-2 eyebrow !text-[10px]">Host / Name</th>
            <th className="px-3 py-2 eyebrow !text-[10px]">Value</th>
            <th className="px-3 py-2 eyebrow !text-[10px]">Status</th>
            <th className="px-3 py-2 eyebrow !text-[10px] w-16"></th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, idx) => (
            <tr
              key={`${rec.record}-${rec.name}-${idx}`}
              className="border-t border-[var(--color-pib-line)] align-top"
            >
              <td className="px-3 py-2 font-mono text-xs">
                {rec.record}
                {rec.type ? <span className="text-[var(--color-pib-text-muted)]"> / {rec.type}</span> : null}
              </td>
              <td className="px-3 py-2 font-mono text-xs break-all">{rec.name}</td>
              <td className="px-3 py-2 font-mono text-xs break-all">
                {rec.value}
                {rec.priority !== undefined && (
                  <span className="block text-[var(--color-pib-text-muted)] mt-0.5">
                    priority {rec.priority}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--color-pib-text-muted)]">
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
    <div className="bento-card !p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[var(--color-pib-text-muted)] text-[20px]">dns</span>
          <div className="min-w-0">
            <p className="font-medium truncate">{domain.name}</p>
            <p className="text-xs text-[var(--color-pib-text-muted)] font-mono">
              {domain.region || 'default region'}
            </p>
          </div>
          <StatusBadge status={domain.status} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-pib-secondary !py-1.5 !px-3 !text-sm disabled:opacity-50"
            type="button"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="btn-pib-secondary !py-1.5 !px-3 !text-sm"
            type="button"
          >
            {expanded ? 'Hide DNS' : 'Show DNS'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-pib-secondary !py-1.5 !px-3 !text-sm !text-[#FCA5A5] disabled:opacity-50"
            type="button"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-[#FCA5A5]">{error}</p>}

      {expanded && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-[var(--color-pib-text-muted)]">
            Add these records at your DNS host. Once propagated, click Refresh to re-check Resend.
          </p>
          <DnsRecordsTable records={domain.dnsRecords ?? []} />
        </div>
      )}
    </div>
  )
}

export default function PortalEmailDomainsPage() {
  const [domains, setDomains] = useState<EmailDomain[]>([])
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadDomains = useCallback(() => {
    setLoading(true)
    fetch('/api/v1/email/domains')
      .then((r) => r.json())
      .then((body) => {
        setDomains((body.data ?? []) as EmailDomain[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadDomains()
  }, [loadDomains])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim().toLowerCase()
    if (!name) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/v1/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFormError(body.error ?? 'Failed to add domain')
        return
      }
      setNewName('')
      loadDomains()
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
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Sender setup</p>
        <h1 className="pib-page-title mt-2">Email Domains</h1>
        <p className="pib-page-sub max-w-2xl">
          Verify a domain you own to send campaigns from your own brand. Until verified,
          campaigns fall back to the shared partnersinbiz.online domain.
        </p>
      </header>

      <div className="bento-card !p-5">
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="yourdomain.co.za"
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)] text-[var(--color-pib-text)] text-sm placeholder:text-[var(--color-pib-text-muted)] focus:outline-none focus:border-[var(--color-pib-accent)]"
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={submitting || !newName.trim()}
            className="btn-pib-accent disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add domain'}
          </button>
        </form>
        {formError && <p className="mt-2 text-sm text-[#FCA5A5]">{formError}</p>}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="pib-skeleton h-20" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="bento-card p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-pib-accent)]">dns</span>
          <h2 className="font-display text-2xl mt-4">No domains yet.</h2>
          <p className="text-sm text-[var(--color-pib-text-muted)] max-w-md mx-auto mt-2 text-pretty">
            Add a domain you own above to start the verification process. Until then, campaigns
            send from the shared partnersinbiz.online domain.
          </p>
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
