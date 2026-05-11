'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

interface BrandKit {
  brandName: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  backgroundColor: string
  textColor: string
  defaultFromName: string
  defaultFromLocal: string
  defaultReplyTo: string
  postalAddress: string
  social: {
    twitter?: string
    linkedin?: string
    instagram?: string
    facebook?: string
    youtube?: string
    tiktok?: string
  }
}

const EMPTY: BrandKit = {
  brandName: '', logoUrl: '',
  primaryColor: '#F5A623', secondaryColor: '#0A0A0B',
  accentColor: '#F5A623', backgroundColor: '#F4F4F5', textColor: '#0A0A0B',
  defaultFromName: '', defaultFromLocal: 'hello', defaultReplyTo: '',
  postalAddress: '',
  social: {},
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pib-label">{label}</label>
      {children}
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pib-label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-9 h-9 rounded-md border border-[var(--color-pib-line)] cursor-pointer bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="pib-input font-mono text-sm w-32"
          maxLength={7}
        />
      </div>
    </div>
  )
}

export default function BrandingPage() {
  const [kit, setKit] = useState<BrandKit>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/brand-kit')
      .then(r => r.json())
      .then(d => { setKit({ ...EMPTY, ...d, social: { ...EMPTY.social, ...(d.social ?? {}) } }) })
      .catch(() => setError('Failed to load brand kit.'))
      .finally(() => setLoading(false))
  }, [])

  function set<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setKit(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function setSocial(key: keyof BrandKit['social'], value: string) {
    setKit(prev => ({ ...prev, social: { ...prev.social, [key]: value } }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/v1/brand-kit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kit),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
    } catch {
      setError('Failed to save. Try again.')
    } finally {
      setSaving(false)
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
        <h1 className="font-display text-3xl mt-1">Branding</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)] mt-1">
          Your brand identity — used across emails, reports, and client-facing content.
        </p>
      </div>

      {error && (
        <p className="text-sm text-[#FCA5A5] bg-[#FCA5A5]/10 border border-[#FCA5A5]/30 rounded-lg px-4 py-2.5">
          {error}
        </p>
      )}

      {/* Identity */}
      <section className="bento-card !p-6 space-y-5">
        <h2 className="font-display text-lg">Identity</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Brand / Business Name">
            <input className="pib-input" value={kit.brandName} onChange={e => set('brandName', e.target.value)} placeholder="Acme Corp" />
          </Field>
          <Field label="Logo URL">
            <input className="pib-input" value={kit.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://…" />
          </Field>
        </div>
        {kit.logoUrl && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-pib-line)] bg-white/[0.02]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={kit.logoUrl} alt="Logo preview" className="h-10 w-auto object-contain rounded" />
            <span className="text-xs text-[var(--color-pib-text-muted)]">Logo preview</span>
          </div>
        )}
      </section>

      {/* Colors */}
      <section className="bento-card !p-6 space-y-5">
        <h2 className="font-display text-lg">Colours</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          <ColorField label="Primary" value={kit.primaryColor} onChange={v => set('primaryColor', v)} />
          <ColorField label="Secondary" value={kit.secondaryColor} onChange={v => set('secondaryColor', v)} />
          <ColorField label="Accent" value={kit.accentColor} onChange={v => set('accentColor', v)} />
          <ColorField label="Background" value={kit.backgroundColor} onChange={v => set('backgroundColor', v)} />
          <ColorField label="Text" value={kit.textColor} onChange={v => set('textColor', v)} />
        </div>
      </section>

      {/* Email defaults */}
      <section className="bento-card !p-6 space-y-5">
        <h2 className="font-display text-lg">Email Defaults</h2>
        <p className="text-sm text-[var(--color-pib-text-muted)] -mt-2">
          Applied to every email sent on behalf of your brand.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="From Name">
            <input className="pib-input" value={kit.defaultFromName} onChange={e => set('defaultFromName', e.target.value)} placeholder="Acme Corp" />
          </Field>
          <Field label="From Email (local part)">
            <div className="flex items-center gap-0">
              <input className="pib-input rounded-r-none border-r-0" value={kit.defaultFromLocal} onChange={e => set('defaultFromLocal', e.target.value)} placeholder="hello" />
              <span className="pib-input rounded-l-none border-l-0 bg-white/[0.03] text-[var(--color-pib-text-muted)] text-sm select-none">@yourdomain.com</span>
            </div>
          </Field>
          <Field label="Reply-To Address">
            <input className="pib-input" value={kit.defaultReplyTo} onChange={e => set('defaultReplyTo', e.target.value)} placeholder="hello@acme.com" />
          </Field>
          <Field label="Postal Address">
            <input className="pib-input" value={kit.postalAddress} onChange={e => set('postalAddress', e.target.value)} placeholder="123 Main St, Cape Town, 8001" />
          </Field>
        </div>
      </section>

      {/* Social links */}
      <section className="bento-card !p-6 space-y-5">
        <h2 className="font-display text-lg">Social Links</h2>
        <p className="text-sm text-[var(--color-pib-text-muted)] -mt-2">
          Shown in email footers and reports.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(['twitter', 'linkedin', 'instagram', 'facebook', 'youtube', 'tiktok'] as const).map(platform => (
            <Field key={platform} label={platform.charAt(0).toUpperCase() + platform.slice(1)}>
              <input
                className="pib-input"
                value={kit.social[platform] ?? ''}
                onChange={e => setSocial(platform, e.target.value)}
                placeholder={`https://${platform}.com/yourbrand`}
              />
            </Field>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4 pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-pib-accent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save branding'}
        </button>
        {saved && (
          <span className="text-sm text-[var(--color-pib-success)] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
