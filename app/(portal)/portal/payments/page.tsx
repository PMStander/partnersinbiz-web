'use client'
export const dynamic = 'force-dynamic'

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Payments</h1>
        <p className="text-sm text-white/40 mt-1">Invoices and payment history for your projects.</p>
      </div>

      <div className="border border-white/10 p-12 text-center">
        <p className="text-white/40 text-sm">No invoices issued yet.</p>
        <p className="text-white/20 text-xs mt-2">
          Invoices will appear here once your project is confirmed.
        </p>
      </div>
    </div>
  )
}
