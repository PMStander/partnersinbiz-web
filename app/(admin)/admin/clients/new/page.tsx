'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewClientPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    industry: '',
    description: '',
    billingEmail: '',
    plan: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/v1/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          website: formData.website,
          industry: formData.industry,
          description: formData.description,
          billingEmail: formData.billingEmail,
          plan: formData.plan,
          type: 'client',
          status: 'onboarding',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to create client')
        return
      }

      router.push('/admin/clients')
    } catch (err) {
      setError('An error occurred while creating the client')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <div className="text-xs text-on-surface-variant font-label uppercase tracking-wide">
        <Link href="/admin/clients" className="hover:text-on-surface">Clients</Link>
        <span className="mx-2">/</span>
        <span>New Client</span>
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-headline font-bold text-on-surface">New Client</h1>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error message */}
        {error && (
          <div className="pib-card !border-red-500/30 !bg-red-500/5 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Company Details Card */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Company Details
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="pib-label">Organisation Name *</label>
              <input id="name" type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="e.g. Acme Inc" className="pib-input" />
            </div>
            <div>
              <label htmlFor="website" className="pib-label">Website</label>
              <input id="website" type="url" name="website" value={formData.website} onChange={handleChange} placeholder="e.g. https://acme.com" className="pib-input" />
            </div>
          </div>

          <div>
            <label htmlFor="industry" className="pib-label">Industry</label>
            <input id="industry" type="text" name="industry" value={formData.industry} onChange={handleChange} placeholder="e.g. Technology" className="pib-input" />
          </div>

          <div>
            <label htmlFor="description" className="pib-label">Description</label>
            <textarea id="description" name="description" value={formData.description} onChange={handleChange} placeholder="Brief description of the client..." rows={4} className="pib-textarea" />
          </div>
        </div>

        {/* Billing & Plan Card */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Billing & Plan
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="billingEmail" className="pib-label">Billing Email</label>
              <input id="billingEmail" type="email" name="billingEmail" value={formData.billingEmail} onChange={handleChange} placeholder="e.g. billing@acme.com" className="pib-input" />
            </div>
            <div>
              <label htmlFor="plan" className="pib-label">Plan</label>
              <select id="plan" name="plan" value={formData.plan} onChange={handleChange} className="pib-select">
                <option value="">-- Select Plan --</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="agency">Agency</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="pib-btn-primary">
            {loading ? 'Creating...' : 'Create Client'}
          </button>
          <Link href="/admin/clients" className="pib-btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
