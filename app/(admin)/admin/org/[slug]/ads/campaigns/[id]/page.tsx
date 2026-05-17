// app/(admin)/admin/org/[slug]/ads/campaigns/[id]/page.tsx
import Link from 'next/link'
import { resolveOrgIdBySlug } from '@/lib/organizations/resolve-by-slug'
import { getCampaign } from '@/lib/ads/campaigns/store'
import { listAdSets } from '@/lib/ads/adsets/store'
import { listAds } from '@/lib/ads/ads/store'
import { CampaignActionsClient } from './CampaignActionsClient'

interface Params {
  slug: string
  id: string
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug, id } = await params
  const orgId = await resolveOrgIdBySlug(slug)
  if (!orgId) return <div className="text-white/60">Org not found.</div>
  const campaign = await getCampaign(id)
  if (!campaign || campaign.orgId !== orgId) {
    return <div className="text-white/60">Campaign not found.</div>
  }
  const [adSets, ads] = await Promise.all([
    listAdSets({ orgId, campaignId: id }),
    listAds({ orgId, campaignId: id }),
  ])

  const metaId = (campaign.providerData?.meta as { id?: string } | undefined)?.id

  return (
    <article className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/org/${slug}/ads/campaigns`}
            className="text-xs text-white/40 hover:text-white/60"
          >
            ← Campaigns
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{campaign.name}</h1>
          <div className="mt-1 text-sm text-white/50">
            {campaign.objective.toLowerCase()} · {campaign.status.toLowerCase()} · {campaign.adAccountId}
            {metaId && <> · Meta id <code className="text-white/30">{metaId}</code></>}
          </div>
        </div>
        <CampaignActionsClient
          orgId={orgId}
          orgSlug={slug}
          campaignId={id}
          status={campaign.status}
          reviewState={campaign.reviewState}
        />
      </header>

      {campaign.reviewState && (
        <div
          className={[
            'rounded-lg border p-4',
            campaign.reviewState === 'awaiting' && 'border-amber-500/40 bg-amber-500/5',
            campaign.reviewState === 'approved' && 'border-emerald-600/40 bg-emerald-600/5',
            campaign.reviewState === 'rejected' && 'border-red-600/40 bg-red-600/5',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {campaign.reviewState === 'awaiting' && (
            <p className="text-sm font-medium text-amber-100">
              Awaiting client review · submitted to client portal
            </p>
          )}
          {campaign.reviewState === 'approved' && (
            <p className="text-sm font-medium text-emerald-100">
              ✓ Approved by client — ready to launch
            </p>
          )}
          {campaign.reviewState === 'rejected' && (
            <div>
              <p className="text-sm font-medium text-red-100">Client requested changes</p>
              {campaign.rejectionReason && (
                <blockquote className="mt-2 text-xs text-white/60 border-l-2 border-red-500/40 pl-3">
                  {campaign.rejectionReason}
                </blockquote>
              )}
            </div>
          )}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">Ad sets ({adSets.length})</h2>
        {adSets.length === 0 ? (
          <div className="mt-2 rounded border border-dashed border-white/10 p-4 text-sm text-white/40">
            No ad sets — Phase 2 wizard creates an initial ad set with each campaign.
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-white/5 rounded border border-white/10">
            {adSets.map((s) => {
              const setAds = ads.filter((a) => a.adSetId === s.id)
              return (
                <li key={s.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link
                        href={`/admin/org/${slug}/ads/ad-sets/${s.id}`}
                        className="font-medium hover:text-[#F5A623]"
                      >
                        {s.name}
                      </Link>
                      <div className="text-xs text-white/40">
                        {s.optimizationGoal.toLowerCase()} · {s.billingEvent.toLowerCase()}
                      </div>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-white/50">
                      {s.status.toLowerCase()}
                    </span>
                  </div>
                  {setAds.length > 0 && (
                    <ul className="mt-2 ml-4 space-y-1 border-l border-white/5 pl-3">
                      {setAds.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-xs">
                          <Link
                            href={`/admin/org/${slug}/ads/ads/${a.id}`}
                            className="hover:text-[#F5A623]"
                          >
                            {a.name} <span className="text-white/30">({a.format.toLowerCase()})</span>
                          </Link>
                          <span className="text-white/40">{a.status.toLowerCase()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </article>
  )
}
