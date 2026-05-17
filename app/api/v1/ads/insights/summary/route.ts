// app/api/v1/ads/insights/summary/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { adminDb } from '@/lib/firebase/admin'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  /** Sum `metric` values from campaign-level meta_ads rows for a given `since` date. */
  async function sumWindow(since: string, metric: string): Promise<number> {
    const snap = await adminDb
      .collection('metrics')
      .where('orgId', '==', orgId)
      .where('source', '==', 'meta_ads')
      .where('level', '==', 'campaign')
      .where('metric', '==', metric)
      .where('date', '>=', since)
      .get()
    return snap.docs.reduce((sum, d) => sum + ((d.data() as { value?: number }).value ?? 0), 0)
  }

  const [todaySpend, weekSpend, monthSpend, weekImpressions, weekConversions] = await Promise.all([
    sumWindow(today, 'ad_spend'),
    sumWindow(sevenDaysAgo, 'ad_spend'),
    sumWindow(thirtyDaysAgo, 'ad_spend'),
    sumWindow(sevenDaysAgo, 'impressions'),
    sumWindow(sevenDaysAgo, 'conversions'),
  ])

  return apiSuccess({
    today: { spend: todaySpend },
    week: { spend: weekSpend, impressions: weekImpressions, conversions: weekConversions },
    month: { spend: monthSpend },
  })
})
