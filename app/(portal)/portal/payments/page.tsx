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

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

const STATUS_MAP: Record<InvoiceStatus, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'var(--color-outline)' },
  sent:      { label: 'Sent',      color: '#60a5fa' },
  viewed:    { label: 'Viewed',    color: '#c084fc' },
  paid:      { label: 'Paid',      color: '#4ade80' },
  overdue:   { label: 'Overdue',   color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: 'var(--color-outline)' },
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function formatDate(ts: any) {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PaymentsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        // Client portal fetches their own invoices
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Payments</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">Invoices and payment history for your projects.</p>
      </div>

      {loading ? (
        <div className="pib-card">
          <Skeleton className="h-32" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="pib-card text-center">
          <p className="text-[var(--color-on-surface-variant)] text-sm">No invoices issued yet.</p>
          <p className="text-[var(--color-on-surface-variant)] text-xs mt-2">
            Invoices will appear here once your project is confirmed.
          </p>
        </div>
      ) : (
        <div className="pib-card overflow-hidden !p-0">
          <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-[var(--color-card-border)]">
            <p className="col-span-3 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              Invoice
            </p>
            <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              Issued
            </p>
            <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              Due
            </p>
            <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              Amount
            </p>
            <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              Status
            </p>
            <p className="col-span-1 text-[10px] font-label uppercase tracking-widest text-on-surface-variant text-right">
              Actions
            </p>
          </div>

          <div className="divide-y divide-[var(--color-card-border)]">
            {invoices.map(inv => {
              const status = STATUS_MAP[inv.status] ?? { label: inv.status, color: 'var(--color-outline)' }
              return (
                <div
                  key={inv.id}
                  className="grid grid-cols-12 gap-4 items-center px-5 py-3 hover:bg-[var(--color-row-hover)] transition-colors"
                >
                  <div className="col-span-3">
                    <p className="text-sm font-mono text-on-surface">{inv.invoiceNumber}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-on-surface-variant">{formatDate(inv.issueDate)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-on-surface-variant">{formatDate(inv.dueDate)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-on-surface">
                      {formatCurrency(inv.total ?? 0, inv.currency ?? 'USD')}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span
                      className="text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{ background: `${status.color}20`, color: status.color }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <a
                      href={`/api/v1/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-label uppercase tracking-wide"
                      style={{ color: 'var(--color-accent-v2)' }}
                    >
                      PDF
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
