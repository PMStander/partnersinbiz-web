'use client'
// app/(admin)/admin/org/[slug]/ads/campaigns/new/NewCampaignClient.tsx
// Platform picker + conditional wizard mount.
// Sub-3a Phase 2 Batch 4 — additive edit, Meta path unchanged.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CampaignBuilder } from '@/components/ads/CampaignBuilder'
import { SearchCampaignBuilder } from '@/components/ads/google/SearchCampaignBuilder'

type Platform = 'meta' | 'google'

interface Props {
  orgId: string
  orgSlug: string
  currency: string
}

export function NewCampaignClient({ orgId, orgSlug, currency }: Props) {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('meta')

  return (
    <div>
      {/* Platform picker */}
      <div className="mb-8 flex items-center gap-6">
        <span className="text-sm font-medium text-white/60">Platform:</span>
        <div className="flex gap-3">
          {(['meta', 'google'] as const).map((p) => (
            <label
              key={p}
              className={`flex items-center gap-2 rounded border px-4 py-2 text-sm cursor-pointer transition-colors ${
                platform === p
                  ? 'border-[#F5A623] bg-[#F5A623]/5 text-[#F5A623]'
                  : 'border-white/10 text-white/60 hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="platform"
                value={p}
                checked={platform === p}
                onChange={() => setPlatform(p)}
                className="sr-only"
                aria-label={p === 'meta' ? 'Meta (Facebook / Instagram)' : 'Google Search'}
              />
              {p === 'meta' ? 'Meta (Facebook / Instagram)' : 'Google Search'}
            </label>
          ))}
        </div>
      </div>

      {platform === 'meta' ? (
        <CampaignBuilder
          orgId={orgId}
          orgSlug={orgSlug}
          currency={currency}
          onComplete={(r) => {
            router.push(`/admin/org/${orgSlug}/ads/campaigns/${r.campaignId}?created=1`)
          }}
          onCancel={() => router.push(`/admin/org/${orgSlug}/ads/campaigns`)}
        />
      ) : (
        <SearchCampaignBuilder
          orgId={orgId}
          orgSlug={orgSlug}
          onCancel={() => router.push(`/admin/org/${orgSlug}/ads/campaigns`)}
        />
      )}
    </div>
  )
}
