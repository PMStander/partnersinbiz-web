/**
 * Sub-3a Phase 6 acceptance — Conversion tracking + Insights round-trip.
 *
 * Creates a Conversion Action via the Google API → uploads a hashed Enhanced Conversion
 * → fetches insights for an existing campaign over last 7 days → cleans up.
 *
 * Requires:
 *   SMOKE_GOOGLE_ACCESS_TOKEN — valid OAuth access token with adwords scope
 *   SMOKE_GOOGLE_DEVELOPER_TOKEN — developer token
 *   SMOKE_GOOGLE_CUSTOMER_ID — 10-digit customer ID
 *   SMOKE_GOOGLE_LOGIN_CUSTOMER_ID (optional) — MCC ID
 *   SMOKE_GOOGLE_CAMPAIGN_ID (optional) — existing campaign ID to fetch insights for
 *
 * Run: SMOKE_GOOGLE_ACCESS_TOKEN=ya29.xxx SMOKE_GOOGLE_DEVELOPER_TOKEN=xxx \
 *      SMOKE_GOOGLE_CUSTOMER_ID=1234567890 npx tsx scripts/smoke-ads-sub3a-phase6.ts
 */
import {
  createConversionAction,
  removeConversionAction,
  uploadEnhancedConversions,
} from '@/lib/ads/providers/google/conversions'
import { fetchInsights } from '@/lib/ads/providers/google/insights'
import { Timestamp } from 'firebase-admin/firestore'

async function main() {
  const accessToken = process.env.SMOKE_GOOGLE_ACCESS_TOKEN
  const developerToken = process.env.SMOKE_GOOGLE_DEVELOPER_TOKEN
  const customerId = process.env.SMOKE_GOOGLE_CUSTOMER_ID
  const loginCustomerId = process.env.SMOKE_GOOGLE_LOGIN_CUSTOMER_ID
  const campaignId = process.env.SMOKE_GOOGLE_CAMPAIGN_ID

  if (!accessToken || !developerToken || !customerId) {
    console.log('Set SMOKE_GOOGLE_ACCESS_TOKEN + SMOKE_GOOGLE_DEVELOPER_TOKEN + SMOKE_GOOGLE_CUSTOMER_ID to run')
    process.exit(0)
  }

  const callArgs = { customerId, accessToken, developerToken, loginCustomerId }
  const ts = new Date().toISOString()
  const now = Timestamp.now()

  let conversionAction: { resourceName: string; id: string } | null = null

  try {
    console.log(`\n1. Creating Conversion Action "[SMOKE P6] purchase ${ts}"…`)
    conversionAction = await createConversionAction({
      ...callArgs,
      canonical: {
        id: 'smoke-ca',
        orgId: 'smoke-org',
        platform: 'google',
        name: `[SMOKE P6] purchase ${ts}`,
        category: 'PURCHASE',
        valueSettings: { defaultValue: 25, defaultCurrencyCode: 'ZAR' },
        countingType: 'ONE_PER_CLICK',
        createdAt: now,
        updatedAt: now,
      },
    })
    console.log(`   ✓ Conversion Action: ${conversionAction.resourceName}`)

    console.log('\n2. Uploading 1 Enhanced Conversion…')
    const conversionDateTime = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+00:00')
    const uploadResult = await uploadEnhancedConversions({
      ...callArgs,
      events: [
        {
          conversionActionResourceName: conversionAction.resourceName,
          conversionDateTime,
          conversionValue: 49.99,
          currencyCode: 'ZAR',
          orderId: `smoke-${Date.now()}`,
          userIdentifiers: [
            { email: 'smoke-test@partnersinbiz.online' },
          ],
        },
      ],
    })
    console.log(`   ✓ Uploaded ${uploadResult.uploadedCount} conversion${uploadResult.partialFailureError ? ' (with partial failures)' : ''}`)

    if (campaignId) {
      console.log(`\n3. Fetching insights for campaign ${campaignId} (last 7 days)…`)
      const endDate = new Date()
      const startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - 7)
      const insights = await fetchInsights({
        ...callArgs,
        level: 'campaign',
        entityId: campaignId,
        dateRange: {
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
        },
      })
      console.log(`   ✓ Got ${insights.length} daily rows`)
      insights.slice(0, 3).forEach((r) => console.log(`     - ${r.date}: spend=${r.ad_spend}, clicks=${r.clicks}, conv=${r.conversions}`))
    } else {
      console.log('\n3. Skipped insights fetch (set SMOKE_GOOGLE_CAMPAIGN_ID to test)')
    }

    console.log('\n🎉 Sub-3a Phase 6 acceptance: PASSED')
  } finally {
    console.log('\n4. Cleanup…')
    if (conversionAction) {
      try { await removeConversionAction({ ...callArgs, resourceName: conversionAction.resourceName }); console.log('   ✓ Removed Conversion Action') } catch (e) { console.warn('   ! cleanup:', (e as Error).message) }
    }
  }
}

main().catch((err) => { console.error('\n❌ FAILED', err); process.exit(1) })
