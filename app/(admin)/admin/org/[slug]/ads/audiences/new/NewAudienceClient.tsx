'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdCustomAudienceType, AdCustomAudience } from '@/lib/ads/types'
import { CustomAudienceTypePicker } from '@/components/ads/CustomAudienceTypePicker'
import { CustomerListBuilder } from '@/components/ads/audience-builders/CustomerListBuilder'
import { WebsiteCABuilder } from '@/components/ads/audience-builders/WebsiteCABuilder'
import { LookalikeBuilder } from '@/components/ads/audience-builders/LookalikeBuilder'
import { AppCABuilder } from '@/components/ads/audience-builders/AppCABuilder'
import { EngagementCABuilder } from '@/components/ads/audience-builders/EngagementCABuilder'

interface Props { orgId: string; orgSlug: string }

export function NewAudienceClient({ orgId, orgSlug }: Props) {
  const router = useRouter()
  const [type, setType] = useState<AdCustomAudienceType | null>(null)

  function handleComplete(ca: AdCustomAudience) {
    router.push(`/admin/org/${orgSlug}/ads/audiences/${ca.id}?created=1`)
  }
  function handleCancel() {
    router.push(`/admin/org/${orgSlug}/ads/audiences`)
  }

  if (!type) {
    return (
      <section className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">New custom audience</h1>
          <p className="text-sm text-white/60 mt-1">Pick a type to start.</p>
        </header>
        <CustomAudienceTypePicker onSelect={setType} />
      </section>
    )
  }

  const props = { orgId, onComplete: handleComplete, onCancel: handleCancel }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New {type.toLowerCase().replace('_', ' ')} audience</h1>
        <button className="text-sm text-white/40 underline" onClick={() => setType(null)}>← Pick different type</button>
      </header>
      {type === 'CUSTOMER_LIST' && <CustomerListBuilder {...props} />}
      {type === 'WEBSITE' && <WebsiteCABuilder {...props} />}
      {type === 'LOOKALIKE' && <LookalikeBuilder {...props} />}
      {type === 'APP' && <AppCABuilder {...props} />}
      {type === 'ENGAGEMENT' && <EngagementCABuilder {...props} />}
    </section>
  )
}
