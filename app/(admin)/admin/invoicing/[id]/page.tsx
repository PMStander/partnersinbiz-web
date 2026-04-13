'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'

interface Invoice {
  id: string
  invoiceNumber: string
  orgId: string
  status: InvoiceStatus
  total: number
  subtotal: number
  taxRate: number
  taxAmount: number
  currency: string
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[]
  notes?: string
  issueDate?: any
  dueDate?: any
  paidAt?: any
  sentAt?: any
}

const STATUS_MAP: Record<InvoiceStatus, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'var(--color-outline)' },
  sent:      { label: 'Sent',      color: '#60a5fa' },
  viewed:    { label: 'Viewed',    color: '#c084fc' },
  paid:      { label: 'Paid',      color: '#4ade80' },
  overdue:   { label: 'Overdue',   color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: 'var(--color-outline)' },
}

function formatDate(ts: any) {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetch(`/api/v1/invoices/${id}`)
      .then(r => r.json())
      .then(body => { setInvoice(body.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  async function updateStatus(status: InvoiceStatus) {
    if (!invoice) return
    setUpdating(true)
    const res = await fetch(`/api/v1/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) setInvoice(prev => prev ? { ...prev, status } : prev)
    setUpdating(false)
  }

  function handlePrint() {
    window.print()
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-96" /></div>
  if (!invoice) return <div className="pib-card py-12 text-center"><p className="text-on-surface-variant">Invoice not found.</p></div>

  const status = STATUS_MAP[invoice.status]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/invoicing" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">← Invoicing</Link>
          <h1 className="text-2xl font-headline font-bold text-on-surface mt-1">{invoice.invoiceNumber}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-label uppercase tracking-wide px-2 py-1 rounded-full" style={{ background: `${status.color}20`, color: status.color }}>
            {status.label}
          </span>
          <a
            href={`/api/v1/invoices/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="pib-btn-secondary text-sm font-label"
          >
            📄 Download PDF
          </a>
          <button onClick={handlePrint} className="pib-btn-secondary text-sm font-label">Print</button>
        </div>
      </div>

      {/* Invoice card */}
      <div className="pib-card space-y-6" id="invoice-print">
        {/* Top meta */}
        <div className="flex justify-between">
          <div>
            <p className="text-lg font-headline font-bold text-on-surface">Partners in Biz</p>
            <p className="text-sm text-on-surface-variant">partnersinbiz.online</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-headline font-bold" style={{ color: 'var(--color-accent-v2)' }}>{invoice.invoiceNumber}</p>
            <p className="text-xs text-on-surface-variant mt-1">Issued: {formatDate(invoice.issueDate)}</p>
            <p className="text-xs text-on-surface-variant">Due: {formatDate(invoice.dueDate)}</p>
          </div>
        </div>

        <div className="border-t border-[var(--color-card-border)] pt-4">
          <p className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Bill To</p>
          <p className="text-sm font-medium text-on-surface">{invoice.orgId}</p>
        </div>

        {/* Line items */}
        <div>
          <div className="grid grid-cols-12 gap-2 pb-2 border-b border-[var(--color-card-border)]">
            <p className="col-span-6 text-[9px] font-label uppercase tracking-widest text-on-surface-variant">Description</p>
            <p className="col-span-2 text-right text-[9px] font-label uppercase tracking-widest text-on-surface-variant">Qty</p>
            <p className="col-span-2 text-right text-[9px] font-label uppercase tracking-widest text-on-surface-variant">Unit</p>
            <p className="col-span-2 text-right text-[9px] font-label uppercase tracking-widest text-on-surface-variant">Amount</p>
          </div>
          {invoice.lineItems.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-[var(--color-card-border)]/50">
              <p className="col-span-6 text-sm text-on-surface">{item.description}</p>
              <p className="col-span-2 text-right text-sm text-on-surface-variant">{item.quantity}</p>
              <p className="col-span-2 text-right text-sm text-on-surface-variant">${item.unitPrice.toFixed(2)}</p>
              <p className="col-span-2 text-right text-sm font-medium text-on-surface">${item.amount.toFixed(2)}</p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="space-y-1 min-w-48">
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>Subtotal</span><span>${invoice.subtotal?.toFixed(2)}</span>
            </div>
            {invoice.taxRate > 0 && (
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>Tax ({invoice.taxRate}%)</span><span>${invoice.taxAmount?.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-on-surface pt-1 border-t border-[var(--color-card-border)]">
              <span>Total</span>
              <span style={{ color: 'var(--color-accent-v2)' }}>${invoice.total?.toFixed(2)} {invoice.currency}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="border-t border-[var(--color-card-border)] pt-4">
            <p className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Notes</p>
            <p className="text-sm text-on-surface-variant">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
        <div className="flex gap-2 flex-wrap">
          {invoice.status === 'draft' && (
            <button onClick={() => updateStatus('sent')} disabled={updating} className="pib-btn-primary font-label">
              Mark as Sent
            </button>
          )}
          {['sent', 'viewed', 'overdue'].includes(invoice.status) && (
            <button onClick={() => updateStatus('paid')} disabled={updating} className="pib-btn-primary font-label">
              Mark as Paid
            </button>
          )}
          <button onClick={() => updateStatus('cancelled')} disabled={updating} className="pib-btn-secondary font-label text-sm">
            Cancel Invoice
          </button>
        </div>
      )}
    </div>
  )
}
