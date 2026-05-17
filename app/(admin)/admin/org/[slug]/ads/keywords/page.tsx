// app/(admin)/admin/org/[slug]/ads/keywords/page.tsx
// Keywords directory page — MVP landing.
// Keyword management is scoped to an ad group (Google Ad Group), so we direct
// admins to the ad group detail page which mounts KeywordEditor directly.
// A full cross-org keyword listing would require an index scan with no adSetId
// filter and is deferred until there is a clear product need.
// Sub-3a Phase 2 Batch 4.

import Link from 'next/link'
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { listCampaigns } from '@/lib/ads/campaigns/store'
import { listAdSets } from '@/lib/ads/adsets/store'
import type { AdPlatform } from '@/lib/ads/types'

interface Params {
  slug: string
}

export default async function KeywordsPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>

  const [campaigns, adSets] = await Promise.all([
    listCampaigns({ orgId, platform: 'google' as AdPlatform }),
    listAdSets({ orgId }),
  ])

  const googleAdSets = adSets.filter((a) => a.platform === 'google')

  return (
    <article className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Keywords</h1>
        <p className="mt-1 text-sm text-white/50">
          Keywords are managed per ad group. Select an ad group below to view and edit its keywords.
        </p>
      </header>

      {googleAdSets.length === 0 ? (
        <div className="rounded border border-white/10 p-6 text-sm text-white/50">
          No Google ad groups yet.{' '}
          <Link
            href={`/admin/org/${slug}/ads/campaigns/new`}
            className="text-[#F5A623] underline"
          >
            Create a Google Search campaign
          </Link>{' '}
          to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const sets = googleAdSets.filter((a) => a.campaignId === campaign.id)
            if (sets.length === 0) return null
            return (
              <section key={campaign.id}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
                  {campaign.name}
                </h2>
                <ul className="divide-y divide-white/5 rounded border border-white/10">
                  {sets.map((adSet) => (
                    <li key={adSet.id}>
                      <Link
                        href={`/admin/org/${slug}/ads/ad-sets/${adSet.id}`}
                        className="flex items-center justify-between px-4 py-3 text-sm hover:bg-white/5 transition-colors"
                      >
                        <span className="font-medium">{adSet.name}</span>
                        <span className="text-xs text-[#F5A623]">Manage keywords →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </article>
  )
}
