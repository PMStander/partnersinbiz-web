'use client'
import { useRouter } from 'next/navigation'
import { CampaignBuilder } from '@/components/ads/CampaignBuilder'

interface Props {
  orgId: string
  orgSlug: string
  currency: string
}

export function NewCampaignClient({ orgId, orgSlug, currency }: Props) {
  const router = useRouter()
  return (
    <CampaignBuilder
      orgId={orgId}
      orgSlug={orgSlug}
      currency={currency}
      onComplete={(r) => {
        router.push(`/admin/org/${orgSlug}/ads/campaigns/${r.campaignId}?created=1`)
      }}
      onCancel={() => router.push(`/admin/org/${orgSlug}/ads/campaigns`)}
    />
  )
}
