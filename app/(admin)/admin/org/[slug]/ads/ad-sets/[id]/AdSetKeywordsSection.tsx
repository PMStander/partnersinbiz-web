'use client'
// Thin client wrapper so the server page can pass static props to KeywordEditor.
// Sub-3a Phase 2 Batch 4.
import { KeywordEditor } from '@/components/ads/google/KeywordEditor'

interface Props {
  orgId: string
  adSetId: string
  campaignId: string
}

export function AdSetKeywordsSection({ orgId, adSetId, campaignId }: Props) {
  return (
    <section>
      <KeywordEditor orgId={orgId} adSetId={adSetId} campaignId={campaignId} />
    </section>
  )
}
