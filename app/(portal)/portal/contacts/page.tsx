'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ContactForm } from '@/components/admin/crm/ContactForm'
import { fmtTimestamp } from '@/components/admin/email/fmtTimestamp'

const STAGES = ['new', 'contacted', 'replied', 'demo', 'proposal', 'won', 'lost']
const TYPES = ['lead', 'prospect', 'client', 'churned']

interface Contact {
  id: string
  name: string
  email: string
  company?: string
  type: string
  stage: string
  lastContactedAt?: unknown
  tags?: string[]
}

function StageBadge({ stage }: { stage: string }) {
  const win = ['won', 'demo', 'replied']
  const lost = ['lost']
  const color = lost.includes(stage)
    ? 'var(--color-pib-danger, #FCA5A5)'
    : win.includes(stage)
    ? 'var(--color-pib-success)'
    : 'var(--color-pib-accent)'
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full capitalize font-mono"
      style={{ background: `${color}20`, color }}
    >
      {stage}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const color =
    type === 'client'
      ? 'var(--color-pib-success)'
      : type === 'churned'
      ? 'var(--color-pib-danger, #FCA5A5)'
      : 'var(--color-pib-accent)'
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full capitalize font-mono"
      style={{ background: `${color}20`, color }}
    >
      {type}
    </span>
  )
}

export default function PortalContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showNew, setShowNew] = useState(false)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (stageFilter) params.set('stage', stageFilter)
    if (typeFilter) params.set('type', typeFilter)
    const qs = params.toString()
    const res = await fetch(`/api/v1/crm/contacts${qs ? `?${qs}` : ''}`)
    if (res.ok) {
      const body = await res.json()
      setContacts(body.data ?? [])
    }
    setLoading(false)
  }, [search, stageFilter, typeFilter])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  async function createContact(data: Record<string, unknown>) {
    const res = await fetch('/api/v1/crm/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? 'Failed to create contact')
    }
    setShowNew(false)
    fetchContacts()
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">CRM</p>
        <div className="flex items-end justify-between gap-4 flex-wrap mt-2">
          <div>
            <h1 className="pib-page-title">Contacts</h1>
            <p className="pib-page-sub max-w-2xl">
              {loading ? 'Loading…' : `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`} in your audience.
            </p>
          </div>
          <button onClick={() => setShowNew(true)} className="btn-pib-accent">
            <span className="material-symbols-outlined text-base">add</span>
            New contact
          </button>
        </div>
      </header>

      {/* Filters */}
      <section className="flex flex-wrap gap-3">
        <input
          placeholder="Search name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pib-input flex-1 min-w-[240px]"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="pib-input !w-auto"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s} className="bg-black">
              {s}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="pib-input !w-auto"
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t} className="bg-black">
              {t}
            </option>
          ))}
        </select>
      </section>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="pib-skeleton h-12" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="bento-card p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-pib-accent)]">contacts</span>
          <h2 className="font-display text-2xl mt-4">No contacts yet.</h2>
          <p className="text-sm text-[var(--color-pib-text-muted)] mt-2">
            Add your first contact to start building your audience.
          </p>
          <button onClick={() => setShowNew(true)} className="btn-pib-accent mt-6">
            <span className="material-symbols-outlined text-base">add</span>
            Add contact
          </button>
        </div>
      ) : (
        <div className="pib-card-section">
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-[var(--color-pib-line)] bg-white/[0.02]">
            <p className="col-span-3 eyebrow !text-[10px]">Name</p>
            <p className="col-span-3 eyebrow !text-[10px]">Email</p>
            <p className="col-span-2 eyebrow !text-[10px]">Company</p>
            <p className="col-span-1 eyebrow !text-[10px]">Type</p>
            <p className="col-span-1 eyebrow !text-[10px]">Stage</p>
            <p className="col-span-2 eyebrow !text-[10px]">Last contacted</p>
          </div>
          <div className="divide-y divide-[var(--color-pib-line)]">
            {contacts.map((c) => (
              <Link
                href={`/portal/contacts/${c.id}`}
                key={c.id}
                className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-4 items-center px-5 py-4 hover:bg-[var(--color-pib-surface-2)] transition-colors"
              >
                <div className="col-span-2 md:col-span-3">
                  <p className="font-medium text-[var(--color-pib-accent-hover)]">{c.name || '—'}</p>
                  {c.tags && c.tags.length > 0 && (
                    <p className="text-[11px] text-[var(--color-pib-text-muted)] mt-0.5 truncate">
                      {c.tags.join(', ')}
                    </p>
                  )}
                </div>
                <div className="md:col-span-3 text-sm text-[var(--color-pib-text-muted)] truncate">
                  {c.email || '—'}
                </div>
                <div className="md:col-span-2 text-sm text-[var(--color-pib-text-muted)] truncate">
                  {c.company || '—'}
                </div>
                <div className="md:col-span-1">
                  <TypeBadge type={c.type} />
                </div>
                <div className="md:col-span-1">
                  <StageBadge stage={c.stage} />
                </div>
                <div className="col-span-2 md:col-span-2 text-xs text-[var(--color-pib-text-muted)] font-mono">
                  {fmtTimestamp(c.lastContactedAt) || '—'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* New Contact Slide-In */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="w-full max-w-md bg-[var(--color-pib-surface)] border-l border-[var(--color-pib-line)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[var(--color-pib-line)] flex items-center justify-between">
              <h2 className="font-display text-lg">New contact</h2>
              <button
                onClick={() => setShowNew(false)}
                className="text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <ContactForm onSave={createContact} onCancel={() => setShowNew(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
