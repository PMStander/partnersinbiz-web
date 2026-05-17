/**
 * Sub-3a Phase 1 acceptance — list accessible Google Ads customers.
 *
 * Requires:
 *   SMOKE_GOOGLE_ACCESS_TOKEN — a valid OAuth access token with the adwords scope
 *   SMOKE_GOOGLE_DEVELOPER_TOKEN — your developer token (read it from Vercel env)
 *
 * Run: SMOKE_GOOGLE_ACCESS_TOKEN=ya29.xxx SMOKE_GOOGLE_DEVELOPER_TOKEN=xxx npx tsx scripts/smoke-ads-sub3a-phase1.ts
 */
import { listAccessibleCustomers } from '@/lib/ads/providers/google/customers'

async function main() {
  const accessToken = process.env.SMOKE_GOOGLE_ACCESS_TOKEN
  const developerToken = process.env.SMOKE_GOOGLE_DEVELOPER_TOKEN
  if (!accessToken || !developerToken) {
    console.log('Set SMOKE_GOOGLE_ACCESS_TOKEN + SMOKE_GOOGLE_DEVELOPER_TOKEN to run')
    process.exit(0)
  }
  console.log('Listing accessible Google Ads customers…')
  const customers = await listAccessibleCustomers({ accessToken, developerToken })
  console.log(`✓ ${customers.length} customer(s) accessible:`)
  customers.forEach((c) => console.log(`  - ${c.customerId}`))
  if (customers.length === 0) {
    throw new Error('No accessible customers — verify developer token + account access')
  }
  console.log('\nSub-3a Phase 1 acceptance: PASSED')
}

main().catch((err) => {
  console.error('FAILED', err)
  process.exit(1)
})
