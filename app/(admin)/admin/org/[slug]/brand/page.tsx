'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface BrandProfile {
  logoUrl?: string
  logoMarkUrl?: string
  bannerUrl?: string
  tagline?: string
  toneOfVoice?: string
  targetAudience?: string
  doWords?: string[]
  dontWords?: string[]
  fonts?: {
    heading?: string
    body?: string
  }
  socialHandles?: Record<string, string>
  guidelines?: string
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

export default function BrandPage() {
  const params = useParams()
  const slug = params.slug as string

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<BrandProfile>({
    logoUrl: '',
    logoMarkUrl: '',
    bannerUrl: '',
    tagline: '',
    toneOfVoice: '',
    targetAudience: '',
    doWords: [],
    dontWords: [],
    fonts: { heading: '', body: '' },
    socialHandles: {},
    guidelines: '',
  })

  const [doWordInput, setDoWordInput] = useState('')
  const [dontWordInput, setDontWordInput] = useState('')
  const [colors, setColors] = useState({
    primary: '#000000',
    secondary: '#000000',
    accent: '#000000',
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMarkUploading, setLogoMarkUploading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)

  // Load organization
  useEffect(() => {
    const fetchOrg = async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch('/api/v1/organizations')
        if (!res.ok) throw new Error('Failed to fetch organizations')

        const body = await res.json() as { data?: Organization[] }
        const foundOrg = body.data?.find((o) => o.slug === slug)
        if (!foundOrg) throw new Error('Organization not found')

        setOrg(foundOrg)

        const brand = foundOrg.brandProfile || {}
        setFormData({
          logoUrl: brand.logoUrl || '',
          logoMarkUrl: brand.logoMarkUrl || '',
          bannerUrl: brand.bannerUrl || '',
          tagline: brand.tagline || '',
          toneOfVoice: brand.toneOfVoice || '',
          targetAudience: brand.targetAudience || '',
          doWords: brand.doWords || [],
          dontWords: brand.dontWords || [],
          fonts: { heading: brand.fonts?.heading || '', body: brand.fonts?.body || '' },
          socialHandles: brand.socialHandles || {},
          guidelines: brand.guidelines || '',
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    if (slug) {
      fetchOrg()
    }
  }, [slug])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFontsChange = (field: 'heading' | 'body', value: string) => {
    setFormData((prev) => ({
      ...prev,
      fonts: { ...prev.fonts, [field]: value },
    }))
  }

  const handleSocialHandleChange = (platform: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      socialHandles: { ...prev.socialHandles, [platform]: value },
    }))
  }

  const uploadStates: Record<string, (v: boolean) => void> = {
    logoUrl: setLogoUploading,
    logoMarkUrl: setLogoMarkUploading,
    bannerUrl: setBannerUploading,
  }

  async function persistBrandProfile(nextFormData: BrandProfile, options: { showSuccess?: boolean } = {}) {
    if (!org) throw new Error('Organization not found')

    const res = await fetch(`/api/v1/organizations/${org.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandProfile: nextFormData }),
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(body.error || 'Failed to save brand profile')
    }

    setOrg((current) => current ? { ...current, brandProfile: nextFormData } : current)

    if (options.showSuccess !== false) {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'logoMarkUrl' | 'bannerUrl', folder: string) {
    const file = e.target.files?.[0]
    if (!file) return
    const setUploading = uploadStates[field]
    setUploading(true)
    try {
      setSaveError(null)
      setSuccess(false)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', folder)
      if (org?.id) {
        fd.append('orgId', org.id)
        fd.append('relatedToType', 'organization')
        fd.append('relatedToId', org.id)
      }
      const res = await fetch('/api/v1/upload', { method: 'POST', body: fd })
      const body = await res.json()
      if (res.ok && body.data?.url) {
        const nextFormData = { ...formData, [field]: body.data.url }
        setFormData(nextFormData)
        await persistBrandProfile(nextFormData)
      } else {
        setSaveError(body.error ?? 'Upload failed')
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      // reset input so same file can be re-uploaded
      e.target.value = ''
    }
  }

  const addDoWord = () => {
    if (doWordInput.trim()) {
      setFormData((prev) => ({
        ...prev,
        doWords: [...(prev.doWords || []), doWordInput.trim()],
      }))
      setDoWordInput('')
    }
  }

  const removeDoWord = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      doWords: (prev.doWords || []).filter((_, i) => i !== index),
    }))
  }

  const addDontWord = () => {
    if (dontWordInput.trim()) {
      setFormData((prev) => ({
        ...prev,
        dontWords: [...(prev.dontWords || []), dontWordInput.trim()],
      }))
      setDontWordInput('')
    }
  }

  const removeDontWord = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      dontWords: (prev.dontWords || []).filter((_, i) => i !== index),
    }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org) return

    try {
      setSaveError(null)
      setSuccess(false)
      setSaving(true)

      await persistBrandProfile(formData)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          Workspace / Brand
        </p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Brand Profile</h1>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="pib-card border-l-4 p-4"
          style={{ borderColor: '#ef4444', backgroundColor: '#fef2f2' }}
        >
          <p className="text-sm text-[#7f1d1d]">{error}</p>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div
          className="pib-card border-l-4 p-4"
          style={{ borderColor: '#22c55e', backgroundColor: '#f0fdf4' }}
        >
          <p className="text-sm text-[#166534]">Brand profile saved successfully</p>
        </div>
      )}

      {saveError && (
        <div
          className="pib-card border-l-4 p-4"
          style={{ borderColor: '#ef4444', backgroundColor: '#fef2f2' }}
        >
          <p className="text-sm text-[#7f1d1d]">{saveError}</p>
        </div>
      )}

      {/* Brand Form */}
      {loading ? (
        <div className="pib-card space-y-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Logo Section */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">Logo</h2>

            {/* Logo */}
            <div>
              <label className="block text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Logo</label>
              <div className="flex items-start gap-4">
                {formData.logoUrl ? (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-[var(--color-surface-variant)] flex items-center justify-center flex-shrink-0">
                    <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-[var(--color-surface-variant)] flex items-center justify-center flex-shrink-0">
                    <span className="text-on-surface-variant text-xs">No logo</span>
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-label cursor-pointer transition-colors ${logoUploading ? 'opacity-50 cursor-not-allowed' : 'pib-btn-secondary'}`}>
                    {logoUploading ? 'Uploading…' : '↑ Upload Logo'}
                    <input type="file" accept="image/*" className="hidden" disabled={logoUploading || saving} onChange={(e) => handleUpload(e, 'logoUrl', 'brands/logos')} />
                  </label>
                  <input
                    type="url"
                    name="logoUrl"
                    value={formData.logoUrl}
                    onChange={handleChange}
                    placeholder="or paste a URL"
                    className="pib-input w-full text-xs"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            {/* Logo Mark */}
            <div>
              <label className="block text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Logo Mark (Icon/Symbol)</label>
              <div className="flex items-start gap-4">
                {formData.logoMarkUrl ? (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-[var(--color-surface-variant)] flex items-center justify-center flex-shrink-0">
                    <img src={formData.logoMarkUrl} alt="Logo Mark" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-[var(--color-surface-variant)] flex items-center justify-center flex-shrink-0">
                    <span className="text-on-surface-variant text-xs">No mark</span>
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-label cursor-pointer transition-colors ${logoMarkUploading ? 'opacity-50 cursor-not-allowed' : 'pib-btn-secondary'}`}>
                    {logoMarkUploading ? 'Uploading…' : '↑ Upload Logo Mark'}
                    <input type="file" accept="image/*" className="hidden" disabled={logoMarkUploading || saving} onChange={(e) => handleUpload(e, 'logoMarkUrl', 'brands/logos')} />
                  </label>
                  <input
                    type="url"
                    name="logoMarkUrl"
                    value={formData.logoMarkUrl}
                    onChange={handleChange}
                    placeholder="or paste a URL"
                    className="pib-input w-full text-xs"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            {/* Banner */}
            <div>
              <label className="block text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Banner</label>
              {formData.bannerUrl && (
                <div className="w-full h-24 rounded-lg overflow-hidden bg-[var(--color-surface-variant)] mb-2">
                  <img src={formData.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-label cursor-pointer transition-colors flex-shrink-0 ${bannerUploading ? 'opacity-50 cursor-not-allowed' : 'pib-btn-secondary'}`}>
                  {bannerUploading ? 'Uploading…' : '↑ Upload Banner'}
                  <input type="file" accept="image/*" className="hidden" disabled={bannerUploading || saving} onChange={(e) => handleUpload(e, 'bannerUrl', 'brands/banners')} />
                </label>
                <input
                  type="url"
                  name="bannerUrl"
                  value={formData.bannerUrl}
                  onChange={handleChange}
                  placeholder="or paste a URL"
                  className="pib-input flex-1 text-xs"
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Colors Section */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">
              Colors
            </h2>

            {['primary', 'secondary', 'accent'].map((colorKey) => (
              <div key={colorKey} className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                    {colorKey.charAt(0).toUpperCase() + colorKey.slice(1)}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={colors[colorKey as keyof typeof colors]}
                      onChange={(e) => setColors({ ...colors, [colorKey]: e.target.value })}
                      className="h-10 rounded-md cursor-pointer"
                      disabled={saving}
                    />
                    <input
                      type="text"
                      value={colors[colorKey as keyof typeof colors]}
                      onChange={(e) => setColors({ ...colors, [colorKey]: e.target.value })}
                      placeholder="#000000"
                      className="flex-1 px-3 py-2 rounded-md text-sm"
                      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Voice & Tone Section */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">
              Voice & Tone
            </h2>

            <div>
              <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Tagline
              </label>
              <input
                type="text"
                name="tagline"
                value={formData.tagline}
                onChange={handleChange}
                placeholder="e.g. Build faster, grow smarter"
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Tone of Voice
              </label>
              <textarea
                name="toneOfVoice"
                value={formData.toneOfVoice}
                onChange={handleChange}
                placeholder="e.g. Professional but approachable, avoid jargon"
                rows={3}
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Target Audience
              </label>
              <input
                type="text"
                name="targetAudience"
                value={formData.targetAudience}
                onChange={handleChange}
                placeholder="e.g. SMB founders in tech"
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                disabled={saving}
              />
            </div>

            {/* Do Words */}
            <div>
              <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Words to Use
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={doWordInput}
                  onChange={(e) => setDoWordInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addDoWord()
                    }
                  }}
                  placeholder="Type and press Enter"
                  className="flex-1 px-3 py-2 rounded-md text-sm"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={addDoWord}
                  className="pib-btn-secondary text-xs px-3"
                  disabled={saving}
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(formData.doWords || []).map((word, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1 rounded-full text-sm"
                    style={{ backgroundColor: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }}
                  >
                    {word}
                    <button
                      type="button"
                      onClick={() => removeDoWord(idx)}
                      className="text-xs opacity-70 hover:opacity-100"
                      disabled={saving}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Don't Words */}
            <div>
              <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Words to Avoid
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={dontWordInput}
                  onChange={(e) => setDontWordInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addDontWord()
                    }
                  }}
                  placeholder="Type and press Enter"
                  className="flex-1 px-3 py-2 rounded-md text-sm"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={addDontWord}
                  className="pib-btn-secondary text-xs px-3"
                  disabled={saving}
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(formData.dontWords || []).map((word, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1 rounded-full text-sm"
                    style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
                  >
                    {word}
                    <button
                      type="button"
                      onClick={() => removeDontWord(idx)}
                      className="text-xs opacity-70 hover:opacity-100"
                      disabled={saving}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Typography Section */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">
              Typography
            </h2>

            <div>
              <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Heading Font
              </label>
              <input
                type="text"
                value={formData.fonts?.heading || ''}
                onChange={(e) => handleFontsChange('heading', e.target.value)}
                placeholder="e.g. Inter, Helvetica"
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Body Font
              </label>
              <input
                type="text"
                value={formData.fonts?.body || ''}
                onChange={(e) => handleFontsChange('body', e.target.value)}
                placeholder="e.g. DM Sans, Open Sans"
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                disabled={saving}
              />
            </div>
          </div>

          {/* Social Handles Section */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">
              Social Handles
            </h2>

            {SOCIAL_PLATFORMS.map((platform) => (
              <div key={platform}>
                <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </label>
                <input
                  type="text"
                  value={formData.socialHandles?.[platform] || ''}
                  onChange={(e) => handleSocialHandleChange(platform, e.target.value)}
                  placeholder={
                    platform === 'twitter'
                      ? '@handle'
                      : platform === 'linkedin'
                        ? 'company/slug'
                        : `@${platform}handle`
                  }
                  className="w-full px-3 py-2 rounded-md text-sm"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                  disabled={saving}
                />
              </div>
            ))}
          </div>

          {/* Guidelines Section */}
          <div className="pib-card space-y-4">
            <h2 className="text-sm font-label uppercase tracking-widest text-on-surface-variant">
              Additional Guidelines
            </h2>
            <p className="text-xs text-on-surface-variant">Markdown supported</p>
            <textarea
              name="guidelines"
              value={formData.guidelines}
              onChange={handleChange}
              placeholder="Free-form guidelines for brand consistency..."
              rows={6}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={saving}
            />
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <button
              type="submit"
              className="pib-btn-primary text-sm font-label"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Brand Profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
