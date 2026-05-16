// app/(admin)/admin/org/[slug]/ads/campaigns/new/page.tsx
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { getConnection } from '@/lib/ads/connections/store'
import { NewCampaignClient } from './NewCampaignClient'

interface Params {
  slug: string
}

export default async function NewCampaignPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>

  const meta = await getConnection({ orgId, platform: 'meta' })
  if (!meta) {
    return (
      <div className="rounded-lg border border-white/10 p-6">
        <p className="text-white/60">
          No Meta connection. Connect Meta first under{' '}
          <a href={`/admin/org/${slug}/ads/connections`} className="text-[#F5A623] underline">
            Connections
          </a>
          .
        </p>
      </div>
    )
  }
  if (!meta.defaultAdAccountId) {
    return (
      <div className="rounded-lg border border-white/10 p-6">
        <p className="text-white/60">
          Connected to Meta but no default ad account selected. Pick one under{' '}
          <a href={`/admin/org/${slug}/ads/connections`} className="text-[#F5A623] underline">
            Connections
          </a>
          .
        </p>
      </div>
    )
  }
  const adAccount = meta.adAccounts.find((a) => a.id === meta.defaultAdAccountId)
  return (
    <NewCampaignClient
      orgId={orgId}
      orgSlug={slug}
      currency={adAccount?.currency ?? 'USD'}
    />
  )
}
