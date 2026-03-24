// app/(admin)/admin/email/compose/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { ComposeForm } from '@/components/admin/email/ComposeForm'

export default function ComposePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Compose Email</h1>
        <p className="text-on-surface-variant text-sm mt-0.5">
          Send immediately or schedule for later.
        </p>
      </div>
      <ComposeForm />
    </div>
  )
}
