/**
 * Phase 5 acceptance smoke — placeholder.
 *
 * Real Meta Insights API testing requires a campaign that's been actively
 * delivering for >24h. Most Phase 5 functionality is covered by unit tests
 * (refresh/queue/worker/insights API/cron) + the daily cron exercises the
 * full pipeline against real data once campaigns ship.
 *
 * For a live smoke, set SMOKE_ORG_ID + SMOKE_CAMPAIGN_ID (Meta-side ID)
 * and run with a campaign that has delivery in the last 7 days.
 */
import { listConnections, decryptAccessToken } from '@/lib/ads/connections/store'
import { metaProvider } from '@/lib/ads/providers/meta'

async function main() {
  const orgId = process.env.SMOKE_ORG_ID
  const metaCampaignId = process.env.SMOKE_CAMPAIGN_ID
  if (!orgId || !metaCampaignId) {
    console.log('Set SMOKE_ORG_ID + SMOKE_CAMPAIGN_ID to run the live smoke')
    process.exit(0)
  }
  const conns = await listConnections({ orgId })
  const meta = conns.find((c) => c.platform === 'meta')
  if (!meta) throw new Error(`No Meta connection on org ${orgId}`)
  const accessToken = decryptAccessToken(meta)
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const insights = await metaProvider.listInsights!({
    metaObjectId: metaCampaignId,
    accessToken,
    since: sevenDaysAgo,
    until: today,
    level: 'campaign',
  })
  console.log('✓ Insights pulled:', JSON.stringify(insights, null, 2))
}

main()
