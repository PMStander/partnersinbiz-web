'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Persona {
  name: string
  role: string
  painPoints: string
}

interface Competitor {
  url: string
  relationship: 'differentiate' | 'inspire'
}

interface BrandProfile {
  logoUrl?: string
  logoMarkUrl?: string
  faviconUrl?: string
  bannerUrl?: string
  tagline?: string
  oneLiner?: string
  keyDifferentiators?: string[]
  toneOfVoice?: string
  targetAudience?: string
  personas?: Persona[]
  doWords?: string[]
  dontWords?: string[]
  designAesthetic?: string[]
  colorMode?: 'light' | 'dark' | 'both'
  competitors?: Competitor[]
  imageryTypes?: string[]
  imageryMoods?: string[]
  fonts?: {
    heading?: string
    body?: string
    mono?: string
    weights?: string
    headingScale?: 'large' | 'medium' | 'compact'
  }
  socialHandles?: Record<string, string>
  guidelines?: string
}

interface BrandColors {
  primary?: string
  secondary?: string
  accent?: string
  background?: string
  surface?: string
  text?: string
  textMuted?: string
  border?: string
  success?: string
  warning?: string
  error?: string
  notes?: Record<string, string>
}

interface Organization {
  id: string
  name: string
  slug: string
  brandProfile?: BrandProfile
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

const SOCIAL_PLATFORMS = ['twitter', 'linkedin', 'instagram', 'facebook', 'tiktok', 'youtube']

const COLOR_DEFS = [
  { key: 'primary',    label: 'Primary',         hint: 'CTAs, key actions, brand highlights' },
  { key: 'secondary',  label: 'Secondary',        hint: 'Supporting accents, gradients' },
  { key: 'accent',     label: 'Accent',           hint: 'Hover states, interactive elements' },
  { key: 'background', label: 'Background',       hint: 'Page / app background' },
  { key: 'surface',    label: 'Surface / Card',   hint: 'Cards, panels, containers' },
  { key: 'text',       label: 'Text',             hint: 'Primary body text' },
  { key: 'textMuted',  label: 'Text Muted',       hint: 'Secondary text, captions, labels' },
  { key: 'border',     label: 'Border / Divider', hint: 'Lines, separators, outlines' },
  { key: 'success',    label: 'Success',          hint: 'Confirmations, positive states' },
  { key: 'warning',    label: 'Warning',          hint: 'Cautions, non-critical alerts' },
  { key: 'error',      label: 'Error',            hint: 'Errors, destructive actions' },
]

const AESTHETIC_OPTIONS = [
  'minimal', 'bold', 'editorial', 'playful', 'corporate',
  'luxury', 'tech', 'warm', 'dark', 'light', 'clean', 'gritty',
]

const IMAGERY_TYPES  = ['photography', 'illustration', 'icons', '3D / CGI', 'mixed']
const IMAGERY_MOODS  = ['clean', 'gritty', 'warm', 'cool', 'minimal', 'rich', 'dramatic', 'airy', 'moody']

const inputCls = "w-full px-3 py-2 rounded-md text-sm bg-[var(--color-surface)] border border-[var(--color-outline)] text-on-surface placeholder:text-on-surface-variant focus:outline-none"
const labelCls = "block text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-1.5"

function TagToggle({ options, selected, onToggle, disabled }: {
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(opt)}
            className="px-3 py-1 rounded-full text-xs font-label transition-colors"
            style={active
              ? { background: 'var(--color-accent-v2)', color: '#fff' }
              : { background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)' }
            }
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

export default function BrandPage() {
  const params = useParams()
  const slug = params.slug as string

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // ── Logo uploads ─────────────────────────────────────────────────────────
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMarkUploading, setLogoMarkUploading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)

  // ── Brand profile form ────────────────────────────────────────────────────
  const [formData, setFormData] = useState<BrandProfile>({
    logoUrl: '', logoMarkUrl: '', faviconUrl: '', bannerUrl: '',
    tagline: '', oneLiner: '', keyDifferentiators: [],
    toneOfVoice: '', targetAudience: '',
    personas: [], doWords: [], dontWords: [],
    designAesthetic: [], colorMode: 'light',
    competitors: [], imageryTypes: [], imageryMoods: [],
    fonts: { heading: '', body: '', mono: '', weights: '', headingScale: 'medium' },
    socialHandles: {}, guidelines: '',
  })

  // ── Colors ────────────────────────────────────────────────────────────────
  const [colors, setColors] = useState<Record<string, string>>({})
  const [colorNotes, setColorNotes] = useState<Record<string, string>>({})

  // ── Tag / list inputs ─────────────────────────────────────────────────────
  const [doWordInput, setDoWordInput] = useState('')
  const [dontWordInput, setDontWordInput] = useState('')
  const [diffInput, setDiffInput] = useState('')
  const [competitorInput, setCompetitorInput] = useState('')
  const [competitorRel, setCompetitorRel] = useState<'differentiate' | 'inspire'>('differentiate')

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchOrg = async () => {
      try {
        setLoading(true); setError(null)
        const listRes = await fetch('/api/v1/organizations')
        if (!listRes.ok) throw new Error('Failed to fetch organizations')
        const listBody = await listRes.json() as { data?: Organization[] }
        const summary = listBody.data?.find((o) => o.slug === slug)
        if (!summary) throw new Error('Organization not found')

        const detailRes = await fetch(`/api/v1/organizations/${summary.id}`)
        if (!detailRes.ok) throw new Error('Failed to fetch organization details')
        const detailBody = await detailRes.json() as { data?: any }
        const d = detailBody.data
        if (!d) throw new Error('Organization not found')

        setOrg({ id: d.id, name: d.name, slug: d.slug, brandProfile: d.brandProfile })

        const b = d.brandProfile ?? {}
        setFormData({
          logoUrl: b.logoUrl ?? '',
          logoMarkUrl: b.logoMarkUrl ?? '',
          faviconUrl: b.faviconUrl ?? '',
          bannerUrl: b.bannerUrl ?? '',
          tagline: b.tagline ?? '',
          oneLiner: b.oneLiner ?? '',
          keyDifferentiators: b.keyDifferentiators ?? [],
          toneOfVoice: b.toneOfVoice ?? '',
          targetAudience: b.targetAudience ?? '',
          personas: b.personas ?? [],
          doWords: b.doWords ?? [],
          dontWords: b.dontWords ?? [],
          designAesthetic: b.designAesthetic ?? [],
          colorMode: b.colorMode ?? 'light',
          competitors: b.competitors ?? [],
          imageryTypes: b.imageryTypes ?? [],
          imageryMoods: b.imageryMoods ?? [],
          fonts: {
            heading: b.fonts?.heading ?? '',
            body: b.fonts?.body ?? '',
            mono: b.fonts?.mono ?? '',
            weights: b.fonts?.weights ?? '',
            headingScale: b.fonts?.headingScale ?? 'medium',
          },
          socialHandles: b.socialHandles ?? {},
          guidelines: b.guidelines ?? '',
        })

        const saved: BrandColors = d.settings?.brandColors ?? {}
        const loadedColors: Record<string, string> = {}
        for (const { key } of COLOR_DEFS) loadedColors[key] = (saved as any)[key] ?? ''
        setColors(loadedColors)
        setColorNotes(saved.notes ?? {})
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }
    if (slug) fetchOrg()
  }, [slug])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const set = (field: keyof BrandProfile, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  const toggleAesthetic = (v: string) =>
    set('designAesthetic', formData.designAesthetic?.includes(v)
      ? formData.designAesthetic.filter(x => x !== v)
      : [...(formData.designAesthetic ?? []), v])

  const toggleImageryType = (v: string) =>
    set('imageryTypes', formData.imageryTypes?.includes(v)
      ? formData.imageryTypes.filter(x => x !== v)
      : [...(formData.imageryTypes ?? []), v])

  const toggleImageryMood = (v: string) =>
    set('imageryMoods', formData.imageryMoods?.includes(v)
      ? formData.imageryMoods.filter(x => x !== v)
      : [...(formData.imageryMoods ?? []), v])

  // ── Persist ───────────────────────────────────────────────────────────────
  async function persist(profile: BrandProfile, opts: { showSuccess?: boolean } = {}) {
    if (!org) throw new Error('Organization not found')
    const brandColors: BrandColors = { ...colors, notes: colorNotes }
    const res = await fetch(`/api/v1/organizations/${org.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandProfile: profile, settings: { brandColors } }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'Failed to save')
    setOrg(cur => cur ? { ...cur, brandProfile: profile } : cur)
    if (opts.showSuccess !== false) { setSuccess(true); setTimeout(() => setSuccess(false), 3000) }
  }

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logoUrl' | 'logoMarkUrl' | 'bannerUrl',
    folder: string,
    setUploading: (v: boolean) => void,
  ) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setSaveError(null); setSuccess(false)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('folder', folder)
      if (org?.id) { fd.append('orgId', org.id); fd.append('relatedToType', 'organization'); fd.append('relatedToId', org.id) }
      const res = await fetch('/api/v1/upload', { method: 'POST', body: fd })
      const body = await res.json()
      if (res.ok && body.data?.url) {
        const next = { ...formData, [field]: body.data.url }
        setFormData(next); await persist(next)
      } else { setSaveError(body.error ?? 'Upload failed') }
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Upload failed') }
    finally { setUploading(false); e.target.value = '' }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); if (!org) return
    try { setSaveError(null); setSuccess(false); setSaving(true); await persist(formData) }
    catch (e) { setSaveError(e instanceof Error ? e.message : 'An error occurred') }
    finally { setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Workspace / Brand</p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Brand Profile</h1>
        <p className="text-sm text-on-surface-variant mt-1">Everything agents and designers need to produce on-brand work.</p>
      </div>

      {error && <div className="pib-card border-l-4 p-4" style={{ borderColor: '#ef4444' }}><p className="text-sm text-red-600">{error}</p></div>}
      {success && <div className="pib-card border-l-4 p-4" style={{ borderColor: '#22c55e' }}><p className="text-sm text-green-700">Brand profile saved.</p></div>}
      {saveError && <div className="pib-card border-l-4 p-4" style={{ borderColor: '#ef4444' }}><p className="text-sm text-red-600">{saveError}</p></div>}

      {loading ? (
        <div className="pib-card space-y-4">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">

          {/* ── IDENTITY ─────────────────────────────────────────────────── */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Identity</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Tagline <span className="text-on-surface-variant/50 normal-case tracking-normal font-normal">— short, punchy, memorable</span></label>
                <input className={inputCls} value={formData.tagline ?? ''} onChange={e => set('tagline', e.target.value)} placeholder="e.g. Software your competitors will copy." disabled={saving} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>One-liner / elevator pitch <span className="text-on-surface-variant/50 normal-case tracking-normal font-normal">— 1 sentence, what you do + for whom</span></label>
                <input className={inputCls} value={formData.oneLiner ?? ''} onChange={e => set('oneLiner', e.target.value)} placeholder="We build X for Y so they can Z." disabled={saving} />
              </div>
            </div>

            {/* Key differentiators */}
            <div>
              <label className={labelCls}>Key Differentiators <span className="text-on-surface-variant/50 normal-case tracking-normal font-normal">— what sets you apart</span></label>
              <div className="flex gap-2 mb-2">
                <input className={inputCls} value={diffInput} onChange={e => setDiffInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (diffInput.trim()) { set('keyDifferentiators', [...(formData.keyDifferentiators ?? []), diffInput.trim()]); setDiffInput('') } } }}
                  placeholder="e.g. EFT-first invoicing, no Stripe" disabled={saving} />
                <button type="button" className="pib-btn-secondary text-xs px-3 shrink-0" disabled={saving} onClick={() => { if (diffInput.trim()) { set('keyDifferentiators', [...(formData.keyDifferentiators ?? []), diffInput.trim()]); setDiffInput('') } }}>Add</button>
              </div>
              <div className="space-y-1">
                {(formData.keyDifferentiators ?? []).map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-on-surface">
                    <span className="text-on-surface-variant">·</span>
                    <span className="flex-1">{d}</span>
                    <button type="button" className="text-xs text-on-surface-variant hover:text-red-400" onClick={() => set('keyDifferentiators', (formData.keyDifferentiators ?? []).filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── LOGO & ASSETS ─────────────────────────────────────────────── */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Logo & Assets</h2>

            {/* Logo */}
            <div>
              <label className={labelCls}>Logo (full wordmark)</label>
              <div className="flex items-start gap-4">
                {formData.logoUrl
                  ? <div className="w-20 h-20 rounded-lg overflow-hidden bg-[var(--color-surface-variant)] flex items-center justify-center shrink-0"><img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" /></div>
                  : <div className="w-20 h-20 rounded-lg bg-[var(--color-surface-variant)] flex items-center justify-center shrink-0"><span className="text-on-surface-variant text-xs">No logo</span></div>}
                <div className="flex-1 space-y-2">
                  <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-label cursor-pointer transition-colors ${logoUploading ? 'opacity-50 cursor-not-allowed' : 'pib-btn-secondary'}`}>
                    {logoUploading ? 'Uploading…' : '↑ Upload'}
                    <input type="file" accept="image/*" className="hidden" disabled={logoUploading || saving} onChange={e => handleUpload(e, 'logoUrl', 'brands/logos', setLogoUploading)} />
                  </label>
                  <input type="url" className={`${inputCls} text-xs`} value={formData.logoUrl ?? ''} onChange={e => set('logoUrl', e.target.value)} placeholder="or paste URL" disabled={saving} />
                </div>
              </div>
            </div>

            {/* Logo mark */}
            <div>
              <label className={labelCls}>Logo Mark (icon / symbol)</label>
              <div className="flex items-start gap-4">
                {formData.logoMarkUrl
                  ? <div className="w-20 h-20 rounded-lg overflow-hidden bg-[var(--color-surface-variant)] flex items-center justify-center shrink-0"><img src={formData.logoMarkUrl} alt="Mark" className="w-full h-full object-contain" /></div>
                  : <div className="w-20 h-20 rounded-lg bg-[var(--color-surface-variant)] flex items-center justify-center shrink-0"><span className="text-on-surface-variant text-xs">No mark</span></div>}
                <div className="flex-1 space-y-2">
                  <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-label cursor-pointer transition-colors ${logoMarkUploading ? 'opacity-50 cursor-not-allowed' : 'pib-btn-secondary'}`}>
                    {logoMarkUploading ? 'Uploading…' : '↑ Upload'}
                    <input type="file" accept="image/*" className="hidden" disabled={logoMarkUploading || saving} onChange={e => handleUpload(e, 'logoMarkUrl', 'brands/logos', setLogoMarkUploading)} />
                  </label>
                  <input type="url" className={`${inputCls} text-xs`} value={formData.logoMarkUrl ?? ''} onChange={e => set('logoMarkUrl', e.target.value)} placeholder="or paste URL" disabled={saving} />
                </div>
              </div>
            </div>

            {/* Favicon */}
            <div>
              <label className={labelCls}>Favicon URL</label>
              <input type="url" className={inputCls} value={formData.faviconUrl ?? ''} onChange={e => set('faviconUrl', e.target.value)} placeholder="https://example.com/favicon.ico" disabled={saving} />
            </div>

            {/* Banner */}
            <div>
              <label className={labelCls}>Banner / OG Image</label>
              {formData.bannerUrl && <div className="w-full h-24 rounded-lg overflow-hidden bg-[var(--color-surface-variant)] mb-2"><img src={formData.bannerUrl} alt="Banner" className="w-full h-full object-cover" /></div>}
              <div className="flex items-center gap-3">
                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-label cursor-pointer transition-colors shrink-0 ${bannerUploading ? 'opacity-50 cursor-not-allowed' : 'pib-btn-secondary'}`}>
                  {bannerUploading ? 'Uploading…' : '↑ Upload'}
                  <input type="file" accept="image/*" className="hidden" disabled={bannerUploading || saving} onChange={e => handleUpload(e, 'bannerUrl', 'brands/banners', setBannerUploading)} />
                </label>
                <input type="url" className={`${inputCls} flex-1 text-xs`} value={formData.bannerUrl ?? ''} onChange={e => set('bannerUrl', e.target.value)} placeholder="or paste URL" disabled={saving} />
              </div>
            </div>
          </div>

          {/* ── COLOURS ──────────────────────────────────────────────────── */}
          <div className="pib-card space-y-5">
            <div>
              <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Colour Palette</h2>
              <p className="text-xs text-on-surface-variant mt-1">Add a usage note per colour so agents know when to apply each one.</p>
            </div>

            <div>
              <label className={labelCls}>Colour Mode</label>
              <div className="flex gap-3">
                {(['light', 'dark', 'both'] as const).map(m => (
                  <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="colorMode" value={m} checked={formData.colorMode === m} onChange={() => set('colorMode', m)} disabled={saving} />
                    <span className="capitalize">{m}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {COLOR_DEFS.map(({ key, label, hint }) => (
                <div key={key} className="rounded-lg border border-outline-variant p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={colors[key] || '#000000'}
                      onChange={e => setColors(prev => ({ ...prev, [key]: e.target.value }))}
                      className="h-9 w-12 rounded cursor-pointer shrink-0"
                      disabled={saving}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-label uppercase tracking-wide text-on-surface">{label}</span>
                        <span className="text-[10px] text-on-surface-variant">{hint}</span>
                      </div>
                      <input
                        type="text"
                        value={colors[key] || ''}
                        onChange={e => setColors(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="#000000 or transparent"
                        className="mt-1 w-full px-2 py-1 rounded text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-outline)]"
                        disabled={saving}
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={colorNotes[key] || ''}
                    onChange={e => setColorNotes(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="Usage note (optional) — e.g. Use only for primary CTA buttons"
                    className="w-full px-2 py-1 rounded text-xs bg-[var(--color-surface)] border border-[var(--color-outline)] text-on-surface-variant"
                    disabled={saving}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── DESIGN AESTHETIC ─────────────────────────────────────────── */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Design Aesthetic</h2>
            <p className="text-xs text-on-surface-variant">Select all that apply. Agents use this to choose layout density, component style, and imagery treatment.</p>
            <TagToggle options={AESTHETIC_OPTIONS} selected={formData.designAesthetic ?? []} onToggle={toggleAesthetic} disabled={saving} />
          </div>

          {/* ── VOICE & TONE ─────────────────────────────────────────────── */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Voice & Tone</h2>

            <div>
              <label className={labelCls}>Tone of Voice</label>
              <textarea className={inputCls} value={formData.toneOfVoice ?? ''} onChange={e => set('toneOfVoice', e.target.value)} placeholder="e.g. Direct, confident, honest. No jargon. British editorial register." rows={3} disabled={saving} />
            </div>

            <div>
              <label className={labelCls}>Target Audience</label>
              <input className={inputCls} value={formData.targetAudience ?? ''} onChange={e => set('targetAudience', e.target.value)} placeholder="e.g. Ambitious SMEs in South Africa, UK, and US" disabled={saving} />
            </div>

            {/* Personas */}
            <div>
              <label className={labelCls}>Personas</label>
              <div className="space-y-3 mb-3">
                {(formData.personas ?? []).map((p, i) => (
                  <div key={i} className="rounded-lg border border-outline-variant p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input className={inputCls} value={p.name} onChange={e => { const arr = [...(formData.personas ?? [])]; arr[i] = { ...arr[i], name: e.target.value }; set('personas', arr) }} placeholder="Name (e.g. The Founder)" disabled={saving} />
                      <input className={inputCls} value={p.role} onChange={e => { const arr = [...(formData.personas ?? [])]; arr[i] = { ...arr[i], role: e.target.value }; set('personas', arr) }} placeholder="Role / title" disabled={saving} />
                    </div>
                    <textarea className={inputCls} value={p.painPoints} onChange={e => { const arr = [...(formData.personas ?? [])]; arr[i] = { ...arr[i], painPoints: e.target.value }; set('personas', arr) }} placeholder="Pain points, goals, what they care about" rows={2} disabled={saving} />
                    <button type="button" className="text-xs text-on-surface-variant hover:text-red-400" onClick={() => set('personas', (formData.personas ?? []).filter((_, j) => j !== i))}>Remove persona</button>
                  </div>
                ))}
              </div>
              <button type="button" className="pib-btn-secondary text-xs px-3" disabled={saving} onClick={() => set('personas', [...(formData.personas ?? []), { name: '', role: '', painPoints: '' }])}>+ Add persona</button>
            </div>

            {/* Do words */}
            <div>
              <label className={labelCls}>Words to Use</label>
              <div className="flex gap-2 mb-2">
                <input className={inputCls} value={doWordInput} onChange={e => setDoWordInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (doWordInput.trim()) { set('doWords', [...(formData.doWords ?? []), doWordInput.trim()]); setDoWordInput('') } } }}
                  placeholder="Type and press Enter" disabled={saving} />
                <button type="button" className="pib-btn-secondary text-xs px-3 shrink-0" disabled={saving} onClick={() => { if (doWordInput.trim()) { set('doWords', [...(formData.doWords ?? []), doWordInput.trim()]); setDoWordInput('') } }}>Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(formData.doWords ?? []).map((w, i) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }}>
                    {w}<button type="button" onClick={() => set('doWords', (formData.doWords ?? []).filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Don't words */}
            <div>
              <label className={labelCls}>Words to Avoid</label>
              <div className="flex gap-2 mb-2">
                <input className={inputCls} value={dontWordInput} onChange={e => setDontWordInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (dontWordInput.trim()) { set('dontWords', [...(formData.dontWords ?? []), dontWordInput.trim()]); setDontWordInput('') } } }}
                  placeholder="Type and press Enter" disabled={saving} />
                <button type="button" className="pib-btn-secondary text-xs px-3 shrink-0" disabled={saving} onClick={() => { if (dontWordInput.trim()) { set('dontWords', [...(formData.dontWords ?? []), dontWordInput.trim()]); setDontWordInput('') } }}>Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(formData.dontWords ?? []).map((w, i) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: '#fee2e2', color: '#991b1b' }}>
                    {w}<button type="button" onClick={() => set('dontWords', (formData.dontWords ?? []).filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">×</button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── TYPOGRAPHY ───────────────────────────────────────────────── */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Typography</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Heading Font</label>
                <input className={inputCls} value={formData.fonts?.heading ?? ''} onChange={e => set('fonts', { ...formData.fonts, heading: e.target.value })} placeholder="e.g. Instrument Serif" disabled={saving} />
              </div>
              <div>
                <label className={labelCls}>Body Font</label>
                <input className={inputCls} value={formData.fonts?.body ?? ''} onChange={e => set('fonts', { ...formData.fonts, body: e.target.value })} placeholder="e.g. Geist Sans" disabled={saving} />
              </div>
              <div>
                <label className={labelCls}>Mono / Label Font</label>
                <input className={inputCls} value={formData.fonts?.mono ?? ''} onChange={e => set('fonts', { ...formData.fonts, mono: e.target.value })} placeholder="e.g. Geist Mono" disabled={saving} />
              </div>
              <div>
                <label className={labelCls}>Font Weights in Use</label>
                <input className={inputCls} value={formData.fonts?.weights ?? ''} onChange={e => set('fonts', { ...formData.fonts, weights: e.target.value })} placeholder="e.g. 400, 600, 700" disabled={saving} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Heading Scale Preference</label>
                <div className="flex gap-4">
                  {(['large', 'medium', 'compact'] as const).map(s => (
                    <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" value={s} checked={(formData.fonts?.headingScale ?? 'medium') === s} onChange={() => set('fonts', { ...formData.fonts, headingScale: s })} disabled={saving} />
                      <span className="capitalize">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── COMPETITORS ──────────────────────────────────────────────── */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Competitors & Inspiration</h2>
            <p className="text-xs text-on-surface-variant">Add brands to differentiate from, and brands to draw visual/tone inspiration from.</p>
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1`} value={competitorInput} onChange={e => setCompetitorInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (competitorInput.trim()) { set('competitors', [...(formData.competitors ?? []), { url: competitorInput.trim(), relationship: competitorRel }]); setCompetitorInput('') } } }}
                placeholder="https://competitor.com" disabled={saving} />
              <select className={`${inputCls} w-36 shrink-0`} value={competitorRel} onChange={e => setCompetitorRel(e.target.value as any)} disabled={saving}>
                <option value="differentiate">Differentiate</option>
                <option value="inspire">Inspire</option>
              </select>
              <button type="button" className="pib-btn-secondary text-xs px-3 shrink-0" disabled={saving}
                onClick={() => { if (competitorInput.trim()) { set('competitors', [...(formData.competitors ?? []), { url: competitorInput.trim(), relationship: competitorRel }]); setCompetitorInput('') } }}>Add</button>
            </div>
            <div className="space-y-2">
              {(formData.competitors ?? []).map((c, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-label shrink-0 ${c.relationship === 'inspire' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {c.relationship}
                  </span>
                  <span className="flex-1 text-on-surface-variant font-mono text-xs truncate">{c.url}</span>
                  <button type="button" className="text-xs text-on-surface-variant hover:text-red-400" onClick={() => set('competitors', (formData.competitors ?? []).filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* ── IMAGERY ──────────────────────────────────────────────────── */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Imagery Style</h2>
            <div>
              <label className={labelCls}>Content Type</label>
              <TagToggle options={IMAGERY_TYPES} selected={formData.imageryTypes ?? []} onToggle={toggleImageryType} disabled={saving} />
            </div>
            <div>
              <label className={labelCls}>Mood / Treatment</label>
              <TagToggle options={IMAGERY_MOODS} selected={formData.imageryMoods ?? []} onToggle={toggleImageryMood} disabled={saving} />
            </div>
          </div>

          {/* ── SOCIAL HANDLES ───────────────────────────────────────────── */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Social Handles</h2>
            <div className="grid grid-cols-2 gap-4">
              {SOCIAL_PLATFORMS.map(p => (
                <div key={p}>
                  <label className={labelCls}>{p.charAt(0).toUpperCase() + p.slice(1)}</label>
                  <input className={inputCls} value={formData.socialHandles?.[p] ?? ''} onChange={e => set('socialHandles', { ...formData.socialHandles, [p]: e.target.value })}
                    placeholder={p === 'twitter' ? '@handle' : p === 'linkedin' ? 'company/slug' : `@${p}handle`} disabled={saving} />
                </div>
              ))}
            </div>
          </div>

          {/* ── GUIDELINES ───────────────────────────────────────────────── */}
          <div className="pib-card space-y-3">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Additional Guidelines</h2>
            <p className="text-xs text-on-surface-variant">Free-form. Markdown supported. Anything that doesn't fit the fields above.</p>
            <textarea className={inputCls} value={formData.guidelines ?? ''} onChange={e => set('guidelines', e.target.value)} rows={6} placeholder="e.g. Never use stock photos. Always pair a stat with a source. Hero images at 50% opacity with gradient overlay…" disabled={saving} />
          </div>

          <div className="pt-2">
            <button type="submit" className="pib-btn-primary text-sm font-label" disabled={saving}>
              {saving ? 'Saving…' : 'Save Brand Profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
