// app/api/v1/ads/cron/daily-insights-pull/route.ts
import { NextRequest } from 'next/server'
import { listConnections, decryptAccessToken } from '@/lib/ads/connections/store'
import { listCampaigns } from '@/lib/ads/campaigns/store'
import { listAdSets } from '@/lib/ads/adsets/store'
import { listAds } from '@/lib/ads/ads/store'
import { refreshEntityInsights } from '@/lib/ads/insights/refresh'
import { apiSuccess, apiError } from '@/lib/api/response'

export async function POST(req: NextRequest) {
  // Vercel Cron sends CRON_SECRET in the Authorization header
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError('Unauthorized', 401)
  }

  const { adminDb } = await import('@/lib/firebase/admin')

  // Walk all active Meta connections
  const connsSnap = await adminDb
    .collection('ad_connections')
    .where('platform', '==', 'meta')
    .where('status', '==', 'active')
    .get()

  let totalProcessed = 0
  let totalFailed = 0
  const errors: string[] = []

  for (const connDoc of connsSnap.docs) {
    const conn = connDoc.data() as { orgId: string }
    try {
      const allConns = await listConnections({ orgId: conn.orgId })
      const meta = allConns.find((c) => c.platform === 'meta')
      if (!meta) continue
      const accessToken = decryptAccessToken(meta)

      // List entities at all 3 levels with ACTIVE or PAUSED status
      const [campaigns, adSets, ads] = await Promise.all([
        listCampaigns({ orgId: conn.orgId }),
        listAdSets({ orgId: conn.orgId }),
        listAds({ orgId: conn.orgId }),
      ])

      type Target = {
        metaObjectId: string
        level: 'campaign' | 'adset' | 'ad'
        pibEntityId: string
      }
      const targets: Target[] = []

      for (const c of campaigns) {
        const metaId = (c.providerData?.meta as { id?: string } | undefined)?.id
        if (metaId && (c.status === 'ACTIVE' || c.status === 'PAUSED')) {
          targets.push({ metaObjectId: metaId, level: 'campaign', pibEntityId: c.id })
        }
      }
      for (const s of adSets) {
        const metaId = (s.providerData?.meta as { id?: string } | undefined)?.id
        if (metaId && (s.status === 'ACTIVE' || s.status === 'PAUSED')) {
          targets.push({ metaObjectId: metaId, level: 'adset', pibEntityId: s.id })
        }
      }
      for (const a of ads) {
        const metaId = (a.providerData?.meta as { id?: string } | undefined)?.id
        if (metaId && (a.status === 'ACTIVE' || a.status === 'PAUSED')) {
          targets.push({ metaObjectId: metaId, level: 'ad', pibEntityId: a.id })
        }
      }

      for (const t of targets) {
        try {
          await refreshEntityInsights({
            orgId: conn.orgId,
            accessToken,
            ...t,
            daysBack: 2, // daily cron covers yesterday + today
          })
          totalProcessed++
        } catch (err) {
          totalFailed++
          errors.push(
            `${conn.orgId}/${t.level}/${t.pibEntityId}: ${(err as Error).message}`,
          )
        }
      }
    } catch (err) {
      errors.push(`Org ${conn.orgId} setup: ${(err as Error).message}`)
    }
  }

  return apiSuccess({
    processed: totalProcessed,
    failed: totalFailed,
    errors: errors.slice(0, 20),
  })
}
