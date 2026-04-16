'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
}

export default function NewInvoicePage() {
  const router = useRouter()
  const [orgId, setOrgId] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [taxRate, setTaxRate] = useState(0)
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addLineItem() {
    setLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }])
  }

  function removeLineItem(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const subtotal = lineItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId.trim()) return setError('Client org ID is required')
    if (!lineItems.some(i => i.description && i.unitPrice > 0)) return setError('Add at least one line item')

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, currency, taxRate, notes, dueDate: dueDate || null, lineItems }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to create invoice')
      router.push(`/admin/invoicing/${body.data.id}`)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputClass = "pib-input"

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Invoicing / New</p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">New Invoice</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Client + meta */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Invoice Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Client Org ID *</label>
              <input value={orgId} onChange={e => setOrgId(e.target.value)} className={inputClass} placeholder="org-id or slug" />
            </div>
            <div>
              <label className="pib-label">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="pib-select">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="ZAR">ZAR</option>
              </select>
            </div>
            <div>
              <label className="pib-label">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="pib-label">Tax Rate (%)</label>
              <input type="number" min="0" max="100" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="pib-card space-y-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Line Items</p>
          <div className="grid grid-cols-12 gap-2 text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
            <span className="col-span-6">Description</span>
            <span className="col-span-2">Qty</span>
            <span className="col-span-2">Unit Price</span>
            <span className="col-span-2">Amount</span>
          </div>
          {lineItems.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <input value={item.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} className={`col-span-6 ${inputClass}`} placeholder="Description" />
              <input type="number" min="1" value={item.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} className={`col-span-2 ${inputClass}`} />
              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateLineItem(idx, 'unitPrice', e.target.value)} className={`col-span-2 ${inputClass}`} />
              <div className="col-span-1 text-sm text-on-surface">${(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}</div>
              <button type="button" onClick={() => removeLineItem(idx)} className="col-span-1 text-on-surface-variant hover:text-red-400 transition-colors text-lg leading-none">×</button>
            </div>
          ))}
          <button type="button" onClick={addLineItem} className="pib-btn-secondary text-xs font-label">+ Add Line</button>

          {/* Totals */}
          <div className="border-t border-[var(--color-card-border)] pt-3 space-y-1 text-right">
            <p className="text-sm text-on-surface-variant">Subtotal: <span className="text-on-surface">${subtotal.toFixed(2)}</span></p>
            {taxRate > 0 && <p className="text-sm text-on-surface-variant">Tax ({taxRate}%): <span className="text-on-surface">${taxAmount.toFixed(2)}</span></p>}
            <p className="text-base font-bold text-on-surface">Total: ${total.toFixed(2)} {currency}</p>
          </div>
        </div>

        {/* Notes */}
        <div className="pib-card">
          <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant block mb-2">Notes / Terms</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="pib-textarea" rows={3} placeholder="Payment terms, thank you note, etc." />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="pib-btn-primary font-label">
            {saving ? 'Creating…' : 'Create Invoice'}
          </button>
          <button type="button" onClick={() => router.back()} className="pib-btn-secondary font-label">Cancel</button>
        </div>
      </form>
    </div>
  )
}
