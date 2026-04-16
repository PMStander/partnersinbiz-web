'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface BillingForm {
  // Address
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
  // Company
  vatNumber: string
  registrationNumber: string
  phone: string
  billingEmail: string
  // Banking
  bankName: string
  accountHolder: string
  accountNumber: string
  branchCode: string
  routingNumber: string
  swiftCode: string
  iban: string
}

const emptyForm: BillingForm = {
  line1: '', line2: '', city: '', state: '', postalCode: '', country: '',
  vatNumber: '', registrationNumber: '', phone: '', billingEmail: '',
  bankName: '', accountHolder: '', accountNumber: '', branchCode: '',
  routingNumber: '', swiftCode: '', iban: '',
}

export default function OrgSettingsPage() {
  const params = useParams()
  const slug = params.slug as string

  const [orgId, setOrgId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [form, setForm] = useState<BillingForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const orgsRes = await fetch('/api/v1/organizations')
      const orgsBody = await orgsRes.json()
      const org = (orgsBody.data ?? []).find((o: any) => o.slug === slug)
      if (!org) { setLoading(false); return }

      setOrgId(org.id)
      setOrgName(org.name)

      // Fetch full org details
      const detailRes = await fetch(`/api/v1/organizations/${org.id}`)
      const detailBody = await detailRes.json()
      const d = detailBody.data
      if (d) {
        const bd = d.billingDetails ?? {}
        const addr = bd.address ?? {}
        const bank = bd.bankingDetails ?? {}
        setForm({
          line1: addr.line1 ?? '',
          line2: addr.line2 ?? '',
          city: addr.city ?? '',
          state: addr.state ?? '',
          postalCode: addr.postalCode ?? '',
          country: addr.country ?? '',
          vatNumber: bd.vatNumber ?? '',
          registrationNumber: bd.registrationNumber ?? '',
          phone: bd.phone ?? '',
          billingEmail: d.billingEmail ?? '',
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
        billingEmail: form.billingEmail,
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

  function update(field: keyof BillingForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const inputClass = 'pib-input'

  if (loading) return <div className="pib-skeleton h-96 max-w-3xl mx-auto" />

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          {orgName} / Settings
        </p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Billing & Company Details</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Address */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Address</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="pib-label">Street Address</label>
              <input value={form.line1} onChange={e => update('line1', e.target.value)} className={inputClass} placeholder="123 Main Street" />
            </div>
            <div className="col-span-2">
              <label className="pib-label">Address Line 2</label>
              <input value={form.line2} onChange={e => update('line2', e.target.value)} className={inputClass} placeholder="Suite 100 (optional)" />
            </div>
            <div>
              <label className="pib-label">City</label>
              <input value={form.city} onChange={e => update('city', e.target.value)} className={inputClass} placeholder="Cape Town" />
            </div>
            <div>
              <label className="pib-label">State / Province</label>
              <input value={form.state} onChange={e => update('state', e.target.value)} className={inputClass} placeholder="Western Cape" />
            </div>
            <div>
              <label className="pib-label">Postal Code</label>
              <input value={form.postalCode} onChange={e => update('postalCode', e.target.value)} className={inputClass} placeholder="8001" />
            </div>
            <div>
              <label className="pib-label">Country</label>
              <input value={form.country} onChange={e => update('country', e.target.value)} className={inputClass} placeholder="South Africa" />
            </div>
          </div>
        </div>

        {/* Company Details */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Company Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Billing Email</label>
              <input type="email" value={form.billingEmail} onChange={e => update('billingEmail', e.target.value)} className={inputClass} placeholder="billing@company.com" />
            </div>
            <div>
              <label className="pib-label">Phone</label>
              <input value={form.phone} onChange={e => update('phone', e.target.value)} className={inputClass} placeholder="+27 21 000 0000" />
            </div>
            <div>
              <label className="pib-label">VAT Number</label>
              <input value={form.vatNumber} onChange={e => update('vatNumber', e.target.value)} className={inputClass} placeholder="4000000000" />
            </div>
            <div>
              <label className="pib-label">Registration Number</label>
              <input value={form.registrationNumber} onChange={e => update('registrationNumber', e.target.value)} className={inputClass} placeholder="2020/000000/07" />
            </div>
          </div>
        </div>

        {/* Banking Details */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Banking Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Bank Name</label>
              <input value={form.bankName} onChange={e => update('bankName', e.target.value)} className={inputClass} placeholder="FNB" />
            </div>
            <div>
              <label className="pib-label">Account Holder</label>
              <input value={form.accountHolder} onChange={e => update('accountHolder', e.target.value)} className={inputClass} placeholder="Partners in Biz (Pty) Ltd" />
            </div>
            <div>
              <label className="pib-label">Account Number</label>
              <input value={form.accountNumber} onChange={e => update('accountNumber', e.target.value)} className={inputClass} placeholder="62000000000" />
            </div>
            <div>
              <label className="pib-label">Branch Code</label>
              <input value={form.branchCode} onChange={e => update('branchCode', e.target.value)} className={inputClass} placeholder="250655" />
            </div>
            <div>
              <label className="pib-label">SWIFT Code</label>
              <input value={form.swiftCode} onChange={e => update('swiftCode', e.target.value)} className={inputClass} placeholder="FIRNZAJJ (optional)" />
            </div>
            <div>
              <label className="pib-label">IBAN</label>
              <input value={form.iban} onChange={e => update('iban', e.target.value)} className={inputClass} placeholder="Optional" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <button type="submit" disabled={saving} className="pib-btn-primary font-label">
            {saving ? 'Saving…' : 'Save Details'}
          </button>
          {saved && <span className="text-sm text-green-400">Saved successfully</span>}
        </div>
      </form>
    </div>
  )
}
