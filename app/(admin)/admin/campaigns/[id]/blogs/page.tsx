import { notFound } from 'next/navigation'
import { loadCampaignWithAssets } from '@/lib/campaigns/load'
import { AssetGrid } from '@/components/campaign-cockpit/AssetGrid'

export const dynamic = 'force-dynamic'

export default async function CampaignBlogsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadCampaignWithAssets(id)
  if (!loaded) notFound()
  const { campaign, assets } = loaded
  return (
    <AssetGrid
      campaignId={id}
      brand={campaign.brandIdentity}
      social={[]}
      blogs={assets.blogs ?? []}
      videos={[]}
      filter="blogs"
    />
  )
}
