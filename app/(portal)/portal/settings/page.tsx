'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { updateProfile } from 'firebase/auth'
import { getClientAuth } from '@/lib/firebase/config'

interface OrgInfo {
  id: string
  name: string
  description: string
  website: string
  industry: string
  billingEmail: string
  plan: string
  status: string
}

interface UserInfo {
  uid: string
  name: string
  email: string
  role: string
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-pib-text-muted)]">{label}</p>
      <p className={`text-sm ${muted ? 'text-[var(--color-pib-text-muted)]' : ''}`}>{value || '—'}</p>
    </div>
  )
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  enterprise: 'Enterprise',
}

const INDUSTRY_LABELS: Record<string, string> = {
  saas: 'SaaS',
  ecommerce: 'E-commerce',
  agency: 'Agency',
  healthcare: 'Healthcare',
  finance: 'Finance & Fintech',
  education: 'Education',
  retail: 'Retail',
  hospitality: 'Hospitality',
  real_estate: 'Real Estate',
  other: 'Other',
}

export default function SettingsPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    fetch('/api/v1/portal/org')
      .then(r => r.json())
      .then(d => {
        setOrg(d.org)
        setUser(d.user)
        setDisplayName(d.user?.name ?? '')
      })
      .catch(() => setError('Failed to load settings.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) return
    setSavingName(true)
    setNameError('')
    try {
      const auth = getClientAuth()
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: displayName.trim() })
      }
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await auth.currentUser?.getIdToken() }),
      })
      setNameSaved(true)
    } catch {
      setNameError('Failed to update name.')
    } finally {
      setSavingName(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <span className="relative flex h-3 w-3">
          <span className="absolute inset-0 rounded-full bg-[var(--color-pib-accent)] opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-pib-accent)]" />
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <p className="eyebrow">Client portal</p>
        <h1 className="font-display text-3xl mt-1">Settings</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)] mt-1">
          Your account and business information.
        </p>
      </div>

      {error && (
        <p className="text-sm text-[#FCA5A5] bg-[#FCA5A5]/10 border border-[#FCA5A5]/30 rounded-lg px-4 py-2.5">
          {error}
        </p>
      )}

      {/* Account */}
      <section className="bento-card !p-6 space-y-6">
        <h2 className="font-display text-lg">Your account</h2>

        <form onSubmit={handleSaveName} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="pib-label">Display name</label>
            <div className="flex items-center gap-3">
              <input
                className="pib-input flex-1"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setNameSaved(false) }}
                placeholder="Your name"
              />
              <button
                type="submit"
                disabled={savingName || !displayName.trim()}
                className="btn-pib-accent shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameSaved && (
              <span className="text-xs text-[var(--color-pib-success)] flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Name updated
              </span>
            )}
            {nameError && <p className="text-xs text-[#FCA5A5]">{nameError}</p>}
          </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-[var(--color-pib-line)]">
          <Field label="Email" value={user?.email ?? ''} muted />
          <Field label="Role" value="Client" muted />
        </div>
      </section>

      {/* Business info */}
      {org && (
        <section className="bento-card !p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-display text-lg">Business info</h2>
            <span className="pill text-[10px]">{PLAN_LABELS[org.plan] ?? org.plan}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Business name" value={org.name} />
            <Field label="Industry" value={INDUSTRY_LABELS[org.industry] ?? org.industry} />
            <Field label="Website" value={org.website} />
            <Field label="Billing email" value={org.billingEmail} />
            {org.description && (
              <div className="col-span-full">
                <Field label="Description" value={org.description} />
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--color-pib-text-muted)] pt-2 border-t border-[var(--color-pib-line)]">
            To update your business details, contact your PiB account manager or email{' '}
            <a href="mailto:hello@partnersinbiz.co.za" className="text-[var(--color-pib-accent-hover)] hover:underline">
              hello@partnersinbiz.co.za
            </a>
          </p>
        </section>
      )}

      {/* Branding shortcut */}
      <section className="bento-card !p-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Brand identity</p>
          <p className="text-xs text-[var(--color-pib-text-muted)] mt-0.5">
            Update your logo, colours, and email defaults.
          </p>
        </div>
        <a href="/portal/branding" className="btn-pib-accent shrink-0">
          Manage branding
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </a>
      </section>
    </div>
  )
}
