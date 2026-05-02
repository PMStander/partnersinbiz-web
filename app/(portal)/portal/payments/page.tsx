'use client'

import { useEffect, useState } from 'react'

type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'

interface Invoice {
  id: string
  invoiceNumber: string
  status: InvoiceStatus
  total: number
  currency: string
  issueDate?: any
  dueDate?: any
}

const STATUS_PILL: Record<InvoiceStatus, string> = {
  draft:     'pib-pill',
  sent:      'pib-pill pib-pill-info',
  viewed:    'pib-pill pib-pill-info',
  paid:      'pib-pill pib-pill-success',
  overdue:   'pib-pill pib-pill-danger',
  cancelled: 'pib-pill',
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

function formatDate(ts: any) {
  if (!ts) return '—'
  const secs = ts._seconds ?? ts.seconds
  const d = secs ? new Date(secs * 1000) : new Date(ts)
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PaymentsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const res = await fetch('/api/v1/invoices')
        if (res.ok) {
          const body = await res.json()
          setInvoices(body.data ?? [])
        }
      } catch (error) {
        console.error('Error fetching invoices:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchInvoices()
  }, [])

  const totalPaid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
  const totalOutstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'viewed' || i.status === 'overdue').reduce((s, i) => s + (i.total || 0), 0)
  const currency = invoices[0]?.currency ?? 'ZAR'

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Billing</p>
        <h1 className="pib-page-title mt-2">Payments</h1>
        <p className="pib-page-sub max-w-2xl">Invoices and payment history for every project we&rsquo;ve worked on together.</p>
      </header>

      {!loading && invoices.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="pib-stat-card">
            <p className="eyebrow !text-[10px]">Paid</p>
            <p className="font-display text-3xl mt-3 text-[var(--color-pib-success)]">{formatCurrency(totalPaid, currency)}</p>
            <p className="mt-2 text-xs text-[var(--color-pib-text-muted)] font-mono">{invoices.filter((i) => i.status === 'paid').length} invoices</p>
          </div>
          <div className="pib-stat-card">
            <p className="eyebrow !text-[10px]">Outstanding</p>
            <p className="font-display text-3xl mt-3 text-[var(--color-pib-accent)]">{formatCurrency(totalOutstanding, currency)}</p>
            <p className="mt-2 text-xs text-[var(--color-pib-text-muted)] font-mono">awaiting payment</p>
          </div>
          <div className="pib-stat-card">
            <p className="eyebrow !text-[10px]">Total</p>
            <p className="font-display text-3xl mt-3">{formatCurrency(totalPaid + totalOutstanding, currency)}</p>
            <p className="mt-2 text-xs text-[var(--color-pib-text-muted)] font-mono">{invoices.length} invoices total</p>
          </div>
        </section>
      )}

      {loading ? (
        <div className="pib-skeleton h-64" />
      ) : invoices.length === 0 ? (
        <div className="bento-card p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-pib-accent)]">receipt_long</span>
          <h2 className="font-display text-2xl mt-4">No invoices issued yet.</h2>
          <p className="text-sm text-[var(--color-pib-text-muted)] mt-2">
            Invoices will appear here once your project is confirmed.
          </p>
        </div>
      ) : (
        <div className="pib-card-section">
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-[var(--color-pib-line)] bg-white/[0.02]">
            <p className="col-span-3 eyebrow !text-[10px]">Invoice</p>
            <p className="col-span-2 eyebrow !text-[10px]">Issued</p>
            <p className="col-span-2 eyebrow !text-[10px]">Due</p>
            <p className="col-span-2 eyebrow !text-[10px]">Amount</p>
            <p className="col-span-2 eyebrow !text-[10px]">Status</p>
            <p className="col-span-1 eyebrow !text-[10px] text-right">Actions</p>
          </div>

          <div className="divide-y divide-[var(--color-pib-line)]">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-4 items-center px-5 py-4 hover:bg-[var(--color-pib-surface-2)] transition-colors"
              >
                <div className="col-span-2 md:col-span-3">
                  <p className="font-mono text-sm">{inv.invoiceNumber}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-[var(--color-pib-text-muted)] md:text-[var(--color-pib-text-muted)]">
                    <span className="md:hidden eyebrow !text-[10px] mr-2">Issued</span>
                    {formatDate(inv.issueDate)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-[var(--color-pib-text-muted)]">
                    <span className="md:hidden eyebrow !text-[10px] mr-2">Due</span>
                    {formatDate(inv.dueDate)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm font-display text-lg">
                    {formatCurrency(inv.total ?? 0, inv.currency ?? 'ZAR')}
                  </p>
                </div>
                <div className="col-span-2 md:col-span-2">
                  <span className={STATUS_PILL[inv.status] ?? 'pib-pill'}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {STATUS_LABEL[inv.status] ?? inv.status}
                  </span>
                </div>
                <div className="col-span-2 md:col-span-1 flex md:justify-end">
                  <a
                    href={`/api/v1/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-pib-accent-hover)] hover:text-[var(--color-pib-accent)] inline-flex items-center gap-1 font-mono uppercase tracking-widest"
                  >
                    PDF
                    <span className="material-symbols-outlined text-sm">arrow_outward</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
