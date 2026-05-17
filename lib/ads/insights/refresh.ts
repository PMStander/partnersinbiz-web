// lib/ads/insights/refresh.ts
import { metaProvider } from '@/lib/ads/providers/meta'
import { adminDb } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'
import type { MetaInsightRow, InsightLevel } from '@/lib/ads/providers/meta/insights'

export interface RefreshArgs {
  orgId: string
  accessToken: string
  /** Meta-side object ID — campaign/adset/ad ID on the Meta graph. */
  metaObjectId: string
  level: InsightLevel
  /** Local PiB ID — used as dimensionId in metrics rows. */
  pibEntityId: string
  /** Days back from today. Default 7. */
  daysBack?: number
}

/** Pull insights for one entity, upsert metric rows, update lastRefreshedAt on the entity. */
export async function refreshEntityInsights(args: RefreshArgs): Promise<{
  rowsWritten: number
  daysProcessed: number
}> {
  const daysBack = args.daysBack ?? 7
  const today = new Date()
  const since = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000)
  const sinceStr = since.toISOString().slice(0, 10)
  const untilStr = today.toISOString().slice(0, 10)

  const { data } = (await metaProvider.listInsights!({
    metaObjectId: args.metaObjectId,
    accessToken: args.accessToken,
    since: sinceStr,
    until: untilStr,
    level: args.level,
  })) as { data: MetaInsightRow[] }

  let rowsWritten = 0
  const batch = adminDb.batch()

  for (const row of data) {
    const metrics = mapInsightRow(row)
    for (const [metric, value] of Object.entries(metrics)) {
      if (value == null) continue
      const docId = `meta_ads_${args.orgId}_${args.level}_${args.pibEntityId}_${row.date_start}_${metric}`
      const ref = adminDb.collection('metrics').doc(docId)
      batch.set(ref, {
        orgId: args.orgId,
        source: 'meta_ads',
        level: args.level,
        dimensionId: args.pibEntityId,
        date: row.date_start,
        metric,
        value,
        updatedAt: Timestamp.now(),
      })
      rowsWritten++
    }
  }

  await batch.commit()

  // Update lastRefreshedAt on the entity doc
  const collection =
    args.level === 'campaign' ? 'ad_campaigns' : args.level === 'adset' ? 'ad_sets' : 'ads'
  await adminDb.collection(collection).doc(args.pibEntityId).update({
    lastRefreshedAt: Timestamp.now(),
  })

  return { rowsWritten, daysProcessed: data.length }
}

/**
 * Map a Meta insights row to canonical metric values.
 * Exported for testing; not part of the public API of this module.
 */
export function mapInsightRow(row: MetaInsightRow): Record<string, number | null> {
  const out: Record<string, number | null> = {
    ad_spend: row.spend ? parseFloat(row.spend) : null,
    impressions: row.impressions ? parseInt(row.impressions, 10) : null,
    clicks: row.clicks ? parseInt(row.clicks, 10) : null,
    // Meta returns CTR as a percent string e.g. "1.234"; canonical is 0-1 fraction
    ctr: row.ctr ? parseFloat(row.ctr) / 100 : null,
    cpc: row.cpc ? parseFloat(row.cpc) : null,
    cpm: row.cpm ? parseFloat(row.cpm) : null,
  }

  // Conversions = sum of relevant action types
  const convActionTypes = ['purchase', 'lead', 'complete_registration', 'omni_purchase']
  const convActions = row.actions?.filter((a) => convActionTypes.includes(a.action_type))
  if (convActions && convActions.length > 0) {
    out.conversions = convActions.reduce((sum, a) => sum + parseFloat(a.value), 0)
  }

  // ROAS = total purchase/omni_purchase revenue / spend (only when both are present)
  const revenueActionTypes = ['purchase', 'omni_purchase']
  const convValues = row.action_values?.filter((a) => revenueActionTypes.includes(a.action_type))
  const conversionsRevenue = convValues?.reduce((sum, a) => sum + parseFloat(a.value), 0) ?? 0
  if (conversionsRevenue > 0 && out.ad_spend != null && out.ad_spend > 0) {
    out.roas = conversionsRevenue / out.ad_spend
  }

  return out
}
