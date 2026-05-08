import { notFound } from 'next/navigation'
import { loadCampaignWithAssets } from '@/lib/campaigns/load'
import { AssetGrid } from '@/components/campaign-cockpit/AssetGrid'

export const dynamic = 'force-dynamic'

export default async function CampaignOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const loaded = await loadCampaignWithAssets(id)
  if (!loaded) notFound()
  const { campaign, assets } = loaded

  const totals = assets.meta?.totals ?? { social: 0, blogs: 0, videos: 0 }
  const byStatus = assets.meta?.byStatus ?? { draft: 0, pending_approval: 0, approved: 0, published: 0 }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Blogs" value={totals.blogs} />
        <Stat label="Videos" value={totals.videos} />
        <Stat label="Social" value={totals.social} />
        <Stat label="Awaiting review" value={byStatus.pending_approval ?? 0} accent />
      </section>

      <AssetGrid
        campaignId={id}
        brand={campaign.brandIdentity}
        social={assets.social ?? []}
        blogs={assets.blogs ?? []}
        videos={assets.videos ?? []}
        filter="all"
      />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-pib-text-muted)]">{label}</p>
      <p
        className={`text-2xl font-semibold mt-1 ${
          accent ? 'text-[var(--color-pib-accent)]' : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}
