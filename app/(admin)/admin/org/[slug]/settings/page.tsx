'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Organization {
  id: string
  name: string
  slug: string
  website?: string
  description?: string
  industry?: string
  billingEmail?: string
  status?: string
  settings?: {
    notificationEmail?: string
    defaultApprovalRequired?: boolean
    timezone?: string
    currency?: string
  }
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

const STATUS_OPTIONS = ['active', 'onboarding', 'suspended', 'churned']

export default function SettingsPage() {
  const params = useParams()
  const slug = params.slug as string

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    description: '',
    industry: '',
    billingEmail: '',
    status: 'active',
    notificationEmail: '',
    defaultApprovalRequired: false,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Load organization
  useEffect(() => {
    const fetchOrg = async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch('/api/v1/organizations')
        if (!res.ok) throw new Error('Failed to fetch organizations')

        const body = await res.json()
        const foundOrg = body.data?.find((o: any) => o.slug === slug)
        if (!foundOrg) throw new Error('Organization not found')

        setOrg(foundOrg)
        setFormData({
          name: foundOrg.name || '',
          website: foundOrg.website || '',
          description: foundOrg.description || '',
          industry: foundOrg.industry || '',
          billingEmail: foundOrg.billingEmail || '',
          status: foundOrg.status || 'active',
          notificationEmail: foundOrg.settings?.notificationEmail || '',
          defaultApprovalRequired: foundOrg.settings?.defaultApprovalRequired || false,
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org) return

    try {
      setSaveError(null)
      setSuccess(false)
      setSaving(true)

      const { notificationEmail, defaultApprovalRequired, ...baseFields } = formData
      const res = await fetch(`/api/v1/organizations/${org.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseFields,
          settings: { notificationEmail, defaultApprovalRequired },
        }),
      })

      const body = await res.json()

      if (!res.ok) {
        throw new Error(body.error || 'Failed to save organization')
      }

      setSuccess(true)
      setOrg({ ...org, ...formData })

      // Hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          Workspace / Settings
        </p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Organisation Settings</h1>
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
          <p className="text-sm text-[#166534]">Settings saved successfully</p>
        </div>
      )}

      {/* Settings Form */}
      {loading ? (
        <div className="pib-card space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="pib-card space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
              Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Organization name"
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              required
              disabled={saving}
            />
          </div>

          {/* Website */}
          <div>
            <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
              Website
            </label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://example.com"
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Organization description"
              rows={4}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={saving}
            />
          </div>

          {/* Industry */}
          <div>
            <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
              Industry
            </label>
            <input
              type="text"
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              placeholder="e.g. Technology, Finance, etc."
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={saving}
            />
          </div>

          {/* Billing Email */}
          <div>
            <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
              Billing Email
            </label>
            <input
              type="email"
              name="billingEmail"
              value={formData.billingEmail}
              onChange={handleChange}
              placeholder="billing@example.com"
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={saving}
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={saving}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Notifications section */}
          <div className="border-t border-[var(--color-outline-variant)] pt-4 mt-2">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-4">Notifications</p>

            <div className="mb-4">
              <label className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Notification Email
              </label>
              <input
                type="email"
                name="notificationEmail"
                value={formData.notificationEmail}
                onChange={handleChange}
                placeholder="alerts@client.com"
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                disabled={saving}
              />
              <p className="text-[11px] text-on-surface-variant mt-1">
                Where to send approval requests, invoice notifications, and comment alerts.
              </p>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-on-surface">Require social post approval</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Client must approve posts before they are published.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, defaultApprovalRequired: !prev.defaultApprovalRequired }))}
                disabled={saving}
                className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none"
                style={{ backgroundColor: formData.defaultApprovalRequired ? 'var(--color-accent-v2)' : 'var(--color-outline-variant)' }}
              >
                <span
                  className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5"
                  style={{ transform: formData.defaultApprovalRequired ? 'translateX(22px)' : 'translateX(2px)' }}
                />
              </button>
            </div>
          </div>

          {/* Save Error */}
          {saveError && (
            <p className="text-xs text-[#ef4444]">{saveError}</p>
          )}

          {/* Save Button */}
          <div className="pt-4">
            <button
              type="submit"
              className="pib-btn-primary text-sm font-label"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
