'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { copyToClipboard } from '@/lib/utils/clipboard'

interface OrgForm {
  // General settings
  name: string
  website: string
  description: string
  industry: string
  billingEmail: string
  status: string
  notificationEmail: string
  defaultApprovalRequired: boolean
  // Billing address
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
  // Company billing details
  vatNumber: string
  registrationNumber: string
  phone: string
  // Banking
  bankName: string
  accountHolder: string
  accountNumber: string
  branchCode: string
  routingNumber: string
  swiftCode: string
  iban: string
}

const emptyForm: OrgForm = {
  name: '', website: '', description: '', industry: '', billingEmail: '',
  status: 'active', notificationEmail: '', defaultApprovalRequired: false,
  line1: '', line2: '', city: '', state: '', postalCode: '', country: '',
  vatNumber: '', registrationNumber: '', phone: '',
  bankName: '', accountHolder: '', accountNumber: '', branchCode: '',
  routingNumber: '', swiftCode: '', iban: '',
}

export default function OrgSettingsPage() {
  const params = useParams()
  const slug = params.slug as string

  const [orgId, setOrgId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [form, setForm] = useState<OrgForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  function copyOrgId() {
    if (!orgId) return
    copyToClipboard(orgId).then(() => {
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    })
  }

  useEffect(() => {
    async function load() {
      const orgsRes = await fetch('/api/v1/organizations')
      const orgsBody = await orgsRes.json()
      const org = (orgsBody.data ?? []).find((o: any) => o.slug === slug)
      if (!org) { setLoading(false); return }

      setOrgId(org.id)
      setOrgName(org.name)

      const detailRes = await fetch(`/api/v1/organizations/${org.id}`)
      const detailBody = await detailRes.json()
      const d = detailBody.data
      if (d) {
        const bd = d.billingDetails ?? {}
        const addr = bd.address ?? {}
        const bank = bd.bankingDetails ?? {}
        const settings = d.settings ?? {}
        setForm({
          name: d.name ?? '',
          website: d.website ?? '',
          description: d.description ?? '',
          industry: d.industry ?? '',
          billingEmail: d.billingEmail ?? '',
          status: d.status ?? 'active',
          notificationEmail: settings.notificationEmail ?? '',
          defaultApprovalRequired: settings.defaultApprovalRequired ?? false,
          line1: addr.line1 ?? '',
          line2: addr.line2 ?? '',
          city: addr.city ?? '',
          state: addr.state ?? '',
          postalCode: addr.postalCode ?? '',
          country: addr.country ?? '',
          vatNumber: bd.vatNumber ?? '',
          registrationNumber: bd.registrationNumber ?? '',
          phone: bd.phone ?? '',
          bankName: bank.bankName ?? '',
          accountHolder: bank.accountHolder ?? '',
          accountNumber: bank.accountNumber ?? '',
          branchCode: bank.branchCode ?? '',
          routingNumber: bank.routingNumber ?? '',
          swiftCode: bank.swiftCode ?? '',
          iban: bank.iban ?? '',
        })
      }
      setLoading(false)
    }
    if (slug) load()
  }, [slug])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)

    await fetch(`/api/v1/organizations/${orgId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        website: form.website,
        description: form.description,
        industry: form.industry,
        billingEmail: form.billingEmail,
        status: form.status,
        settings: {
          notificationEmail: form.notificationEmail,
          defaultApprovalRequired: form.defaultApprovalRequired,
        },
        billingDetails: {
          address: {
            line1: form.line1,
            line2: form.line2,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            country: form.country,
          },
          vatNumber: form.vatNumber,
          registrationNumber: form.registrationNumber,
          phone: form.phone,
          bankingDetails: {
            bankName: form.bankName,
            accountHolder: form.accountHolder,
            accountNumber: form.accountNumber,
            branchCode: form.branchCode,
            routingNumber: form.routingNumber,
            swiftCode: form.swiftCode,
            iban: form.iban,
          },
        },
      }),
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function update<K extends keyof OrgForm>(field: K, value: OrgForm[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  if (loading) return <div className="pib-skeleton h-96 max-w-3xl mx-auto" />

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          {orgName} / Settings
        </p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Organisation Settings</h1>
      </div>

      {/* Org ID */}
      {orgId && (
        <div className="pib-card-section">
          <div className="pib-card-section-header">
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Organisation ID</span>
          </div>
          <div className="pib-card-section-row">
            <span className="text-sm text-on-surface-variant">Org ID</span>
            <span className="flex items-center gap-2">
              <code className="font-mono text-xs text-on-surface bg-[var(--color-surface-container)] px-2 py-1 rounded select-all">{orgId}</code>
              <button type="button" onClick={copyOrgId} className="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2 py-1 rounded hover:bg-[var(--color-surface-container)]">
                {copiedId ? 'Copied!' : 'Copy'}
              </button>
            </span>
          </div>
          <div className="px-4 pb-3">
            <p className="text-[11px] text-on-surface-variant/60">Use this ID when configuring AI agents or API integrations for this organisation.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* General Settings */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">General</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Organisation Name</label>
              <input value={form.name} onChange={e => update('name', e.target.value)} className="pib-input" placeholder="Acme Corp" />
            </div>
            <div>
              <label className="pib-label">Website</label>
              <input value={form.website} onChange={e => update('website', e.target.value)} className="pib-input" placeholder="https://acme.com" />
            </div>
            <div className="col-span-2">
              <label className="pib-label">Description</label>
              <textarea value={form.description} onChange={e => update('description', e.target.value)} className="pib-textarea" rows={3} placeholder="Brief description of the organisation" />
            </div>
            <div>
              <label className="pib-label">Industry</label>
              <input value={form.industry} onChange={e => update('industry', e.target.value)} className="pib-input" placeholder="e.g. Technology" />
            </div>
            <div>
              <label className="pib-label">Status</label>
              <select value={form.status} onChange={e => update('status', e.target.value)} className="pib-select">
                <option value="active">Active</option>
                <option value="onboarding">Onboarding</option>
                <option value="suspended">Suspended</option>
                <option value="churned">Churned</option>
              </select>
            </div>
            <div>
              <label className="pib-label">Billing Email</label>
              <input type="email" value={form.billingEmail} onChange={e => update('billingEmail', e.target.value)} className="pib-input" placeholder="billing@company.com" />
            </div>
            <div>
              <label className="pib-label">Notification Email</label>
              <input type="email" value={form.notificationEmail} onChange={e => update('notificationEmail', e.target.value)} className="pib-input" placeholder="notify@company.com" />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <input
                id="defaultApproval"
                type="checkbox"
                checked={form.defaultApprovalRequired}
                onChange={e => update('defaultApprovalRequired', e.target.checked)}
                className="h-4 w-4 rounded border-outline text-primary"
              />
              <label htmlFor="defaultApproval" className="pib-label mb-0 cursor-pointer">
                Require approval by default for new content
              </label>
            </div>
          </div>
        </div>

        {/* Billing Address */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Billing Address</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="pib-label">Street Address</label>
              <input value={form.line1} onChange={e => update('line1', e.target.value)} className="pib-input" placeholder="123 Main Street" />
            </div>
            <div className="col-span-2">
              <label className="pib-label">Address Line 2</label>
              <input value={form.line2} onChange={e => update('line2', e.target.value)} className="pib-input" placeholder="Suite 100 (optional)" />
            </div>
            <div>
              <label className="pib-label">City</label>
              <input value={form.city} onChange={e => update('city', e.target.value)} className="pib-input" placeholder="Cape Town" />
            </div>
            <div>
              <label className="pib-label">State / Province</label>
              <input value={form.state} onChange={e => update('state', e.target.value)} className="pib-input" placeholder="Western Cape" />
            </div>
            <div>
              <label className="pib-label">Postal Code</label>
              <input value={form.postalCode} onChange={e => update('postalCode', e.target.value)} className="pib-input" placeholder="8001" />
            </div>
            <div>
              <label className="pib-label">Country</label>
              <input value={form.country} onChange={e => update('country', e.target.value)} className="pib-input" placeholder="South Africa" />
            </div>
          </div>
        </div>

        {/* Company Details */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Company Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Phone</label>
              <input value={form.phone} onChange={e => update('phone', e.target.value)} className="pib-input" placeholder="+27 21 000 0000" />
            </div>
            <div>
              <label className="pib-label">VAT Number</label>
              <input value={form.vatNumber} onChange={e => update('vatNumber', e.target.value)} className="pib-input" placeholder="4000000000" />
            </div>
            <div>
              <label className="pib-label">Registration Number</label>
              <input value={form.registrationNumber} onChange={e => update('registrationNumber', e.target.value)} className="pib-input" placeholder="2020/000000/07" />
            </div>
          </div>
        </div>

        {/* Banking Details */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Banking Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Bank Name</label>
              <input value={form.bankName} onChange={e => update('bankName', e.target.value)} className="pib-input" placeholder="FNB" />
            </div>
            <div>
              <label className="pib-label">Account Holder</label>
              <input value={form.accountHolder} onChange={e => update('accountHolder', e.target.value)} className="pib-input" placeholder="Partners in Biz (Pty) Ltd" />
            </div>
            <div>
              <label className="pib-label">Account Number</label>
              <input value={form.accountNumber} onChange={e => update('accountNumber', e.target.value)} className="pib-input" placeholder="62000000000" />
            </div>
            <div>
              <label className="pib-label">Branch Code</label>
              <input value={form.branchCode} onChange={e => update('branchCode', e.target.value)} className="pib-input" placeholder="250655" />
            </div>
            <div>
              <label className="pib-label">Routing Number</label>
              <input value={form.routingNumber} onChange={e => update('routingNumber', e.target.value)} className="pib-input" placeholder="Optional" />
            </div>
            <div>
              <label className="pib-label">SWIFT Code</label>
              <input value={form.swiftCode} onChange={e => update('swiftCode', e.target.value)} className="pib-input" placeholder="FIRNZAJJ (optional)" />
            </div>
            <div>
              <label className="pib-label">IBAN</label>
              <input value={form.iban} onChange={e => update('iban', e.target.value)} className="pib-input" placeholder="Optional" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <button type="submit" disabled={saving} className="pib-btn-primary font-label">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {saved && <span className="text-sm text-green-400">Saved successfully</span>}
        </div>
      </form>
    </div>
  )
}
