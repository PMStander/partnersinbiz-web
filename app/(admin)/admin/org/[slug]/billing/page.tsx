'use client'
import { useParams } from 'next/navigation'

export default function BillingPage() {
  const { slug } = useParams()
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Workspace / Billing</p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Billing</h1>
      </div>
      <div className="pib-card py-12 text-center">
        <p className="text-on-surface-variant text-sm">Invoicing coming soon.</p>
      </div>
    </div>
  )
}
