/**
 * Phase 6 acceptance smoke — Meta CAPI test event.
 *
 * Run: SMOKE_PIXEL_CONFIG_ID=<id> SMOKE_TEST_EVENT_CODE=<code> npx tsx scripts/smoke-ads-meta-phase6.ts
 *
 * test_event_code shows the event in Meta Events Manager → Test Events tab
 * without affecting production attribution.
 */
import { sendTestEvent } from '@/lib/ads/capi/test'

async function main() {
  const pixelConfigId = process.env.SMOKE_PIXEL_CONFIG_ID
  const testEventCode = process.env.SMOKE_TEST_EVENT_CODE
  if (!pixelConfigId || !testEventCode) {
    console.log('Set SMOKE_PIXEL_CONFIG_ID + SMOKE_TEST_EVENT_CODE to run')
    process.exit(0)
  }
  const result = await sendTestEvent({ pixelConfigId, testEventCode })
  console.log('Result:', JSON.stringify(result, null, 2))
  if (!result.sent) process.exit(1)
}

main()
