'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'

interface Invoice {
  id: string
  invoiceNumber: string
  orgId: string
  status: InvoiceStatus
  total: number
  currency: string
  issueDate?: any
  dueDate?: any
  paidAt?: any
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

export default function BillingPage() {
  const params = useParams()
  const slug = params.slug as string

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Fetch org then invoices
  useEffect(() => {
    const fetchOrgAndInvoices = async () => {
      try {
        // Look up org by slug from the organizations list
        const orgsRes = await fetch('/api/v1/organizations')
        if (!orgsRes.ok) throw new Error('Failed to fetch organisations')
        const orgsBody = await orgsRes.json()
        const foundOrg = (orgsBody.data ?? []).find((o: any) => o.slug === slug)
        if (!foundOrg) throw new Error('Organisation not found')

        setOrgId(foundOrg.id)

        // Fetch invoices scoped to this org
        const invoicesRes = await fetch(`/api/v1/invoices?orgId=${foundOrg.id}`)
        if (invoicesRes.ok) {
          const invoicesData = await invoicesRes.json()
          setInvoices(invoicesData.data ?? [])
        }
      } catch (error) {
        console.error('Error fetching billing data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (slug) fetchOrgAndInvoices()
  }, [slug])

  const totalBilled = invoices.reduce((sum, inv) => sum + (inv.total ?? 0), 0)
  const outstanding = invoices
    .filter(i => ['sent', 'viewed', 'overdue'].includes(i.status))
    .reduce((sum, inv) => sum + (inv.total ?? 0), 0)
  const paid = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, inv) => sum + (inv.total ?? 0), 0)

  const currency = invoices[0]?.currency ?? 'USD'

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
            Workspace / Billing
          </p>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Billing</h1>
        </div>
        <Link
          href={`/admin/invoicing/new?orgId=${orgId}`}
          className="pib-btn-primary text-sm font-label"
        >
          + New Invoice
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Total Billed
              </p>
              <p className="text-2xl font-headline font-bold" style={{ color: 'var(--color-accent-v2)' }}>
                {formatCurrency(totalBilled, currency)}
              </p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Outstanding
              </p>
              <p className="text-2xl font-headline font-bold text-on-surface">
                {formatCurrency(outstanding, currency)}
              </p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">
                Paid
              </p>
              <p className="text-2xl font-headline font-bold text-on-surface">
                {formatCurrency(paid, currency)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Invoice Table */}
      <div className="pib-card overflow-hidden !p-0">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-[var(--color-card-border)]">
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Invoice #
          </p>
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Issue Date
          </p>
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Due Date
          </p>
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Amount
          </p>
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Status
          </p>
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Actions
          </p>
        </div>

        {loading ? (
          <div className="divide-y divide-[var(--color-card-border)]">
            {[1, 2, 3].map(i => (
              <div key={i} className="px-5 py-4">
                <Skeleton className="h-5 w-48" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-on-surface-variant text-sm mb-4">
              No invoices yet for this workspace.
            </p>
            <Link
              href={`/admin/invoicing/new?orgId=${orgId}`}
              className="pib-btn-primary text-sm font-label"
            >
              Create Invoice
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-card-border)]">
            {invoices.map(inv => {
              const status = STATUS_MAP[inv.status] ?? { label: inv.status, color: 'var(--color-outline)' }
              return (
                <div
                  key={inv.id}
                  className="grid grid-cols-12 gap-4 items-center px-5 py-3 hover:bg-[var(--color-row-hover)] transition-colors"
                >
                  <div className="col-span-2">
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
                  <div className="col-span-2 flex justify-end gap-3">
                    <a
                      href={`/api/v1/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-label uppercase tracking-wide"
                      style={{ color: 'var(--color-accent-v2)' }}
                    >
                      PDF
                    </a>
                    <Link
                      href={`/admin/invoicing/${inv.id}`}
                      className="text-[10px] font-label uppercase tracking-wide"
                      style={{ color: 'var(--color-accent-v2)' }}
                    >
                      View →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
