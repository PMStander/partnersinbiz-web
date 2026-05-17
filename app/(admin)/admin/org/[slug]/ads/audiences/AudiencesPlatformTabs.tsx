'use client'
// app/(admin)/admin/org/[slug]/ads/audiences/AudiencesPlatformTabs.tsx
// Platform-level tab switcher: Meta | Google.
// Renders the Google audience builders client-side; Meta list is passed as RSC children.
// Sub-3a Phase 5 Batch 3 F

import { useState } from 'react'
import { GoogleAudienceBuilders } from './GoogleAudienceBuilders'

type Platform = 'meta' | 'google'

interface Props {
  orgId: string
  orgSlug: string
  metaContent: React.ReactNode
}

export function AudiencesPlatformTabs({ orgId, orgSlug, metaContent }: Props) {
  const [platform, setPlatform] = useState<Platform>('meta')

  return (
    <div className="space-y-6">
      {/* Platform tabs */}
      <div className="flex gap-2">
        {(['meta', 'google'] as Platform[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors capitalize ${
              platform === p
                ? 'bg-[#F5A623] text-black'
                : 'border border-white/10 text-white/60 hover:text-white hover:border-white/30'
            }`}
          >
            {p === 'meta' ? 'Meta' : 'Google'}
          </button>
        ))}
      </div>

      {/* Platform content */}
      {platform === 'meta' && metaContent}
      {platform === 'google' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">New Google audience</h2>
            <p className="text-sm text-white/60 mt-1">
              Choose a Google audience type and configure it below.
            </p>
          </div>
          <GoogleAudienceBuilders orgId={orgId} orgSlug={orgSlug} />
        </div>
      )}
    </div>
  )
}
