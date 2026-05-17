// app/(admin)/admin/org/[slug]/ads/conversion-actions/page.tsx
// Sub-3a Phase 6 Batch 3 F — admin page for managing conversion actions.

import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { listConversionActions } from '@/lib/ads/conversion-actions/store'
import { ConversionActionsClient } from './ConversionActionsClient'

interface Params { slug: string }

export default async function ConversionActionsPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>
  const actions = await listConversionActions({ orgId })
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Conversion Actions</h1>
        <p className="text-sm text-white/50">
          Define what counts as a conversion. Used for tracking + bid optimization.
        </p>
      </header>
      <ConversionActionsClient orgSlug={slug} orgId={orgId} initialActions={actions} />
    </div>
  )
}
